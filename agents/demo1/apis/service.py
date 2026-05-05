"""
Claims service layer — bridges FastAPI routes and Calvin.

Manages session lifecycle and file uploads. All claim processing and
conversational queries go through Calvin via run_chat().
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from commons.logger import get_logger  # noqa: E402
from .schemas import ChatRequest  # noqa: E402

logger = get_logger(__name__)

_AGENT_DIR = Path(__file__).parent.parent  # agents/demo1/
_CASES_DIR = _AGENT_DIR / "data" / "cases"
_SESSIONS_DIR = _AGENT_DIR / "data" / "sessions"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _session_meta_file(session_id: str) -> Path:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return _SESSIONS_DIR / f"{session_id}_meta.json"


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, str(path))


def _read_json(path: Path) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


class ClaimsService:
    def __init__(self) -> None:
        # in-memory cache: session_id → session metadata
        self._sessions: dict[str, dict] = {}

    # ── Session management ────────────────────────────────────────────────────

    def create_session(self, role: str, user_id: str) -> dict:
        """Create a new chat session and persist its metadata."""
        session_id = str(uuid.uuid4())
        now = _now_iso()
        meta = {
            "session_id": session_id,
            "case_id": "",        # populated once intake_agent creates the case
            "role": role,
            "user_id": user_id,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }
        self._sessions[session_id] = meta
        _write_json(_session_meta_file(session_id), meta)
        logger.info("[SERVICE] create_session  session_id=%s role=%s user_id=%s", session_id, role, user_id)
        return meta

    def get_session(self, session_id: str) -> dict | None:
        """Return session metadata, loading from disk if not cached."""
        if session_id in self._sessions:
            return self._sessions[session_id]
        data = _read_json(_session_meta_file(session_id))
        if data:
            self._sessions[session_id] = data
        return data

    def list_sessions(
        self,
        status_filter: str | None = None,
        role_filter: str | None = None,
        user_id_filter: str | None = None,
    ) -> list[dict]:
        results = []
        if not _SESSIONS_DIR.exists():
            return results
        for f in _SESSIONS_DIR.glob("*_meta.json"):
            data = _read_json(f)
            if data is None:
                continue
            if status_filter and data.get("status") != status_filter:
                continue
            if role_filter and data.get("role") != role_filter:
                continue
            if user_id_filter and data.get("user_id") != user_id_filter:
                continue
            results.append(data)
        results.sort(key=lambda r: r.get("updated_at", ""), reverse=True)
        return results

    # ── File upload helpers ───────────────────────────────────────────────────

    def prepare_upload_case(self, session_id: str | None, case_id: str | None) -> tuple[str, str]:
        """Resolve or create session/case for an upload. Returns (case_id, session_id)."""
        if session_id and self.get_session(session_id):
            meta = self.get_session(session_id)
            resolved_case_id = case_id or meta.get("case_id") or str(uuid.uuid4())
        else:
            session_id = str(uuid.uuid4())
            resolved_case_id = case_id or str(uuid.uuid4())
            self.create_session("end_user", "anonymous")

        input_dir = _CASES_DIR / resolved_case_id / "input"
        input_dir.mkdir(parents=True, exist_ok=True)
        return resolved_case_id, session_id

    # ── Chat stream ───────────────────────────────────────────────────────────

    async def chat_stream(
        self, session_id: str, req: ChatRequest
    ) -> AsyncGenerator[str, None]:
        from agents.demo1.agentic.agent import run_chat  # noqa: PLC0415

        logger.info(
            "[SERVICE] chat_stream  session_id=%s role=%s user_id=%s file_ref=%s msg_len=%d",
            session_id, req.role, req.user_id, req.file_ref, len(req.message or ""),
        )

        # Prepend file_ref context if a document was just uploaded
        message = req.message or ""
        if req.file_ref:
            message = (
                f"[Document uploaded — file_ref: {req.file_ref}. "
                f"The document is saved and ready for extraction.]\n\n"
            ) + message

        async for chunk in run_chat(
            session_id=session_id,
            role=req.role,
            user_id=req.user_id,
            message=message,
        ):
            yield chunk

        logger.info("[SERVICE] chat_stream  complete  session_id=%s", session_id)

    # ── Direct approval shortcuts (for frontend buttons) ──────────────────────

    def direct_approve(self, case_id: str, approver_id: str, notes: str,
                       override_decision: str | None, override_amount: str | None) -> dict:
        """Directly approve (or override) a case, bypassing the chat interface."""
        from agents.demo1.agentic.tools.csv_store import approve_case  # noqa: PLC0415

        decision = "overridden" if (override_decision or override_amount) else "approved"
        result = approve_case(
            case_id=case_id,
            approver_id=approver_id,
            decision=decision,
            notes=notes,
            override_decision=override_decision or "",
            override_amount=override_amount or "",
        )
        logger.info("[SERVICE] direct_approve  case_id=%s decision=%s result=%s", case_id, decision, result)
        return {"case_id": case_id, "decision": decision, "result": result}

    def direct_reject(self, case_id: str, approver_id: str, reason: str) -> dict:
        """Directly reject a case, bypassing the chat interface."""
        from agents.demo1.agentic.tools.csv_store import approve_case  # noqa: PLC0415

        result = approve_case(
            case_id=case_id,
            approver_id=approver_id,
            decision="rejected",
            notes=reason,
        )
        logger.info("[SERVICE] direct_reject  case_id=%s result=%s", case_id, result)
        return {"case_id": case_id, "decision": "rejected", "result": result}
