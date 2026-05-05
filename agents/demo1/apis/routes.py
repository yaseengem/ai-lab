"""FastAPI route handlers for the Calvin Claims API."""

from __future__ import annotations

import uuid
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from .schemas import (
    ApproveRequest,
    ChatRequest,
    FileUploadResponse,
    RejectRequest,
    SessionSummary,
)
from .service import ClaimsService

from commons.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()
service = ClaimsService()

_AGENT_DIR = Path(__file__).parent.parent  # agents/demo1/
_CASES_DIR = _AGENT_DIR / "data" / "cases"
_MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB
_ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".docx", ".txt"}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping():
    """Health-check endpoint."""
    return {"status": "ok", "agent": "calvin-claims"}


# ── Session management ────────────────────────────────────────────────────────

@router.post("/sessions")
def create_session(role: str = "end_user", user_id: str = "anonymous"):
    """
    Create a new chat session for the given role and user.
    Returns session_id to use in subsequent /chat calls.
    """
    logger.info("[ROUTE] POST /sessions  role=%s user_id=%s", role, user_id)
    meta = service.create_session(role, user_id)
    return meta


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(
    status: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
):
    """List known sessions, optionally filtered by status, role, or user_id."""
    return service.list_sessions(
        status_filter=status,
        role_filter=role,
        user_id_filter=user_id,
    )


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=FileUploadResponse)
async def upload(
    file: UploadFile = File(...),
    user_id: str = Form("anonymous"),
    session_id: Optional[str] = Form(None),
    case_id: Optional[str] = Form(None),
):
    """
    Upload a claim document (PDF, .txt, image, docx — max 20 MB).
    Returns file_ref which should be passed to POST /chat so Calvin can
    instruct the extraction_agent to process it.
    """
    logger.info("[ROUTE] POST /upload  filename=%s user_id=%s session_id=%s",
                file.filename, user_id, session_id)

    suffix = ""
    if file.filename:
        suffix = ("." + file.filename.rsplit(".", 1)[-1].lower()) if "." in file.filename else ""
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. Accepted: {', '.join(_ALLOWED_SUFFIXES)}.",
        )

    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 20 MB limit.")

    resolved_case_id, resolved_session_id = service.prepare_upload_case(session_id, case_id)

    input_dir = _CASES_DIR / resolved_case_id / "input"
    input_dir.mkdir(parents=True, exist_ok=True)
    safe_name = file.filename or f"upload_{uuid.uuid4().hex}{suffix}"
    dest = input_dir / safe_name
    with open(dest, "wb") as f_out:
        f_out.write(contents)

    file_ref = f"{resolved_case_id}/{safe_name}"
    logger.info("[ROUTE] POST /upload success  file_ref=%s size_bytes=%d", file_ref, len(contents))
    return FileUploadResponse(
        file_ref=file_ref,
        case_id=resolved_case_id,
        session_id=resolved_session_id,
    )


# ── Chat (SSE) ────────────────────────────────────────────────────────────────

@router.post("/chat/{session_id}")
async def chat(session_id: str, req: ChatRequest):
    """
    Send a message to Calvin and stream the response as SSE.

    Event types:
      {"type": "text-delta",  "content": "<token>"}   — incremental token
      {"type": "tool-status", "tool": "<name>", "status": "running"}  — tool invocation
      {"type": "done"}                                 — stream finished
      {"type": "error",       "message": "<msg>"}     — agent error
    """
    logger.info("[ROUTE] POST /chat/%s  role=%s user_id=%s file_ref=%s msg_len=%d",
                session_id, req.role, req.user_id, req.file_ref, len(req.message or ""))

    # Validate session exists (create lazily if not found — for convenience)
    session = service.get_session(session_id)
    if session is None:
        logger.info("[ROUTE] POST /chat/%s  session_not_found — creating lazily", session_id)
        service.create_session(req.role, req.user_id)
        service._sessions[session_id] = {
            "session_id": session_id,
            "role": req.role,
            "user_id": req.user_id,
            "status": "active",
        }

    return StreamingResponse(
        service.chat_stream(session_id, req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Direct approval shortcuts (for frontend buttons) ─────────────────────────

@router.post("/approve/{case_id}")
def approve(case_id: str, req: ApproveRequest):
    """
    Directly approve (or override) a case without going through chat.
    Use this for frontend approve/override buttons.
    After calling this, Calvin's communication_agent should be triggered
    via a chat message: "Send the claimant notification for case {case_id}."
    """
    logger.info("[ROUTE] POST /approve/%s  approver=%s", case_id, req.approver_id)
    result = service.direct_approve(
        case_id=case_id,
        approver_id=req.approver_id,
        notes=req.notes or "",
        override_decision=req.override_decision,
        override_amount=req.override_amount,
    )
    if "ERROR" in result.get("result", ""):
        raise HTTPException(status_code=400, detail=result["result"])
    return result


@router.post("/reject/{case_id}")
def reject(case_id: str, req: RejectRequest):
    """
    Directly reject a case without going through chat.
    Use this for frontend reject buttons.
    """
    logger.info("[ROUTE] POST /reject/%s  approver=%s reason=%s", case_id, req.approver_id, req.reason)
    result = service.direct_reject(
        case_id=case_id,
        approver_id=req.approver_id,
        reason=req.reason,
    )
    if "ERROR" in result.get("result", ""):
        raise HTTPException(status_code=400, detail=result["result"])
    return result


# ── Cases ─────────────────────────────────────────────────────────────────────

@router.get("/status/{session_id}")
def get_status(session_id: str):
    """
    Backward-compatible status endpoint (replaces old GET /status/{session_id}).
    Reads session metadata, looks up the associated case in claims_metadata.csv,
    and maps the new case status to the old WorkflowStatus enum so the frontend
    status badge and polling hook continue to work unchanged.
    """
    import json as _json
    from pathlib import Path

    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    # Try to resolve case_id: first from session meta, then from Calvin's memory file
    case_id = session.get("case_id", "")
    if not case_id:
        memory_file = _AGENT_DIR / "data" / "sessions" / f"{session_id}.json"
        if memory_file.exists():
            try:
                mem = _json.loads(memory_file.read_text(encoding="utf-8"))
                case_id = mem.get("current_case_id", "")
            except Exception:
                pass

    # Look up case status from CSV
    csv_status = ""
    if case_id:
        from agents.demo1.agentic.tools.csv_store import query_claims_metadata  # noqa: PLC0415
        raw = query_claims_metadata(
            filters=_json.dumps({"case_id": case_id}),
            columns='["status"]',
            role="admin",
        )
        try:
            rows = _json.loads(raw)
            if rows:
                csv_status = rows[0].get("status", "")
        except Exception:
            pass

    # Map new CSV status values to old WorkflowStatus enum (for frontend compat)
    _status_map = {
        "intake_complete": "PROCESSING",
        "extraction_complete": "PROCESSING",
        "validated": "PROCESSING",
        "medical_reviewed": "PROCESSING",
        "fraud_checked": "PROCESSING",
        "adjudicated": "PROCESSING",
        "pending_approval": "PENDING_HUMAN_APPROVAL",
        "escalated_to_human": "PENDING_HUMAN_APPROVAL",
        "approved_for_comm": "APPROVED",
        "rejected": "REJECTED",
        "overridden": "APPROVED",
        "communicated": "CLOSED",
        "validation_failed": "REJECTED",
    }
    mapped = _status_map.get(csv_status, "PROCESSING") if csv_status else "INITIATED"

    return {
        "session_id": session_id,
        "case_id": case_id,
        "status": mapped,
        "role": session.get("role", "end_user"),
        "user_id": session.get("user_id", ""),
        "created_at": session.get("created_at", ""),
        "updated_at": session.get("updated_at", ""),
    }


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    """Return full session metadata for a given session_id."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


@router.get("/cases")
def list_cases(
    status: Optional[str] = Query(None),
    claim_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    role: str = Query("support_exec"),
    limit: int = Query(20),
):
    """
    List cases from claims_metadata.csv with optional filters.
    Wraps query_claims_metadata directly for the frontend cases table.
    end_user role is automatically restricted to their own user_id.
    """
    from agents.demo1.agentic.tools.csv_store import query_claims_metadata
    import json as _json

    filters: dict = {}
    if status:
        filters["status"] = status
    if claim_type:
        filters["claim_type"] = claim_type

    result = query_claims_metadata(
        filters=_json.dumps(filters),
        columns="[]",
        limit=limit,
        role=role,
        user_id=user_id or "",
    )
    try:
        return _json.loads(result)
    except _json.JSONDecodeError:
        return []
