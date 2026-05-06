"""FastAPI route handlers for the Settlement Failure Prevention Agent."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .schemas import ApprovalRequest, RunRequest, SessionSummary
from .service import PipelineService
from .agent_bridge import run_pipeline

from commons.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()
service = PipelineService()

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_SUFFIXES = {".csv", ".json"}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping():
    return {"status": "ok", "agent": "nexus-settlement-prevention"}


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    """
    Upload a settlement exposure data file (CSV or JSON).
    Returns upload_id to pass to POST /run.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{suffix}'. Use .csv or .json")
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")
    upload_id = service.save_upload(file.filename or "upload.csv", contents)
    return {"upload_id": upload_id, "filename": file.filename, "bytes": len(contents)}


# ── Run ───────────────────────────────────────────────────────────────────────

@router.post("/run")
async def run(req: RunRequest):
    """
    Start a pipeline run.

    mode='api': Uses mock data from Section 6.2 of the UC8 spec.
    mode='upload': Uses the uploaded file referenced by upload_id.

    Returns session_id to connect to GET /monitor/{session_id} for SSE stream.
    """
    logger.info("[ROUTE] POST /run  mode=%s upload_id=%s", req.mode, req.upload_id)

    trigger_input: dict = {"mode": req.mode, "use_mock": req.use_mock}

    if req.mode == "upload":
        if not req.upload_id:
            raise HTTPException(status_code=400, detail="upload_id required for upload mode")
        upload_path = service.get_upload_path(req.upload_id)
        if not upload_path:
            raise HTTPException(status_code=404, detail=f"Upload {req.upload_id} not found")
        try:
            contents = upload_path.read_text(encoding="utf-8")
            if upload_path.suffix.lower() == ".json":
                trigger_input["data"] = json.loads(contents)
            else:
                # Parse CSV into basic trade/counterparty structure
                trigger_input["data"] = _parse_csv_upload(contents)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse upload: {e}")

    meta = service.create_session(trigger_mode=req.mode, upload_id=req.upload_id)
    session_id = meta["session_id"]

    # Start pipeline as background asyncio task
    asyncio.create_task(run_pipeline(session_id, trigger_input, service))
    logger.info("[ROUTE] pipeline_started  session_id=%s", session_id)

    return {"session_id": session_id, "status": "running", "created_at": meta["created_at"]}


def _parse_csv_upload(content: str) -> dict:
    """Parse a simple CSV upload into exposure snapshot format."""
    reader = csv.DictReader(io.StringIO(content))
    trades = []
    for row in reader:
        trades.append({
            "trade_id": row.get("trade_id", str(uuid.uuid4())[:8]),
            "counterparty_id": row.get("counterparty_id", "UNKNOWN"),
            "isin": row.get("isin", ""),
            "instrument": row.get("instrument", ""),
            "settlement_window": row.get("settlement_window", "T+1"),
            "value_zar": int(float(row.get("value_zar", "0"))),
            "quantity": int(float(row.get("quantity", "0"))),
            "side": row.get("side", "BUY"),
        })
    return {"trades": trades, "source": "upload"}


# ── Monitor (SSE stream) ──────────────────────────────────────────────────────

@router.get("/monitor/{session_id}")
async def monitor(session_id: str):
    """
    Server-Sent Events stream for a pipeline run.

    Connect after POST /run. Events are emitted for each pipeline step,
    tool call, risk item, intervention decision, and human approval gate.
    Stream ends with {"type": "done"} or {"type": "error"}.
    """
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_stream():
        queue = service.get_or_create_queue(session_id)
        import json as _json
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=300)
            except asyncio.TimeoutError:
                yield f"data: {_json.dumps({'type': 'heartbeat'})}\n\n"
                continue
            yield f"data: {_json.dumps(event)}\n\n"
            if event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Approval gate ─────────────────────────────────────────────────────────────

@router.post("/approve/{session_id}/{item_id}")
async def approve(session_id: str, item_id: str, req: ApprovalRequest):
    """Approve a LOLR item that is pending human review."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, item_id, "approve")
    if not resolved:
        raise HTTPException(status_code=404, detail=f"No pending approval for item {item_id}")
    logger.info("[ROUTE] POST /approve/%s/%s  approver=%s", session_id, item_id, req.approver_id)
    return {"session_id": session_id, "item_id": item_id, "decision": "approved"}


@router.post("/reject/{session_id}/{item_id}")
async def reject(session_id: str, item_id: str, req: ApprovalRequest):
    """Reject a LOLR item — escalates to HUMAN_ESCALATION."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, item_id, "reject")
    if not resolved:
        raise HTTPException(status_code=404, detail=f"No pending approval for item {item_id}")
    logger.info("[ROUTE] POST /reject/%s/%s  approver=%s", session_id, item_id, req.approver_id)
    return {"session_id": session_id, "item_id": item_id, "decision": "rejected"}


# ── Session queries ───────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions():
    """List all pipeline runs ordered by most recent first."""
    return service.list_sessions()


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    """Return metadata for a single pipeline run."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/pipeline/{session_id}/state")
def get_pipeline_state(session_id: str):
    """
    Return the full structured pipeline state for a session:
    step statuses, outputs, pending approvals, risk summary, intervention plan.
    """
    state = service.get_pipeline_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Pipeline state not found")
    return state


@router.get("/report/{session_id}")
def get_report(session_id: str):
    """Return the FSCA compliance report for a completed pipeline run."""
    state = service.get_pipeline_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Pipeline state not found")
    report = state.get("fsca_report")
    if not report:
        raise HTTPException(status_code=404, detail="Report not yet generated — pipeline may still be running")
    return report


# ── Summary dashboard ─────────────────────────────────────────────────────────

@router.get("/summary")
def get_summary():
    """
    Aggregate statistics across all pipeline runs for the Summary Dashboard.
    Includes risk distribution by run, intervention breakdown, and trend data.
    """
    return service.get_summary()
