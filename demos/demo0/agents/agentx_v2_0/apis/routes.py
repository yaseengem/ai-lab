"""
Canonical API contract for the v2.0 template agent.

All responses are JSON unless the endpoint is documented as SSE
(POST /chat/{id}, GET /monitor/{id}).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import yaml
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from commons.logger import get_logger

from .schemas import ChatRequest, RunRequest
from .service import Service, load_config

logger = get_logger(__name__)

router = APIRouter()
service = Service()

_AGENT_DIR = Path(__file__).parent.parent
_ARCHITECTURE_FILE = _AGENT_DIR / "architecture.md"
_META = yaml.safe_load((_AGENT_DIR / "metadata.yaml").read_text(encoding="utf-8"))
_AGENT_ID = _AGENT_DIR.name
_VERSION = _META.get("version", "0.1.0")

_TERMINAL_RUN_STATUSES = {"complete", "failed", "interrupted", "cancelled"}


# ── Health ──────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping():
    """Health-check — required by the platform scanner. Carries the startup self-check."""
    check = service.self_check()
    return {
        "status": check["status"],          # "ok" | "degraded"
        "agent": _AGENT_ID,
        "version": _VERSION,
        "checks": check["checks"],
    }


# ── Identity ──────────────────────────────────────────────────────────────────

@router.get("/config")
def get_config():
    """Return the full agent.config.yaml parsed as a JSON object."""
    return load_config()


@router.get("/personas")
def get_personas():
    """Return the persona definitions from agent.config.yaml."""
    cfg = load_config()
    return {"personas": cfg.get("personas", [])}


@router.get("/architecture")
def get_architecture():
    """Return the raw architecture.md contents."""
    try:
        markdown = _ARCHITECTURE_FILE.read_text(encoding="utf-8")
    except FileNotFoundError:
        markdown = ""
    return {"markdown": markdown}


# ── Memory ────────────────────────────────────────────────────────────────────

@router.get("/memory")
def get_memory():
    """Return the agent's memory (rules / preferences / LTM) from the LocalMemoryStore."""
    from agents.agentx_v2_0.agentic.memory_backend import create_memory_backend
    store = create_memory_backend()
    return {"memory": store.all()}


# ── Chat (SSE) ────────────────────────────────────────────────────────────────

@router.post("/chat/{session_id}")
async def chat(session_id: str, req: ChatRequest):
    """
    Operations-aware, persona-aware streaming chat (SSE).
    Creates the session if it does not yet exist.
    """
    if service.get_session(session_id) is None:
        # Lightweight chat session — reuse the meta shape via create_session is
        # heavier than needed, so persist a minimal chat meta directly.
        service.update_session(session_id, session_id=session_id, persona=req.persona,
                               trigger_mode="chat", status="chat", run_id=None,
                               created_at=datetime.now(timezone.utc).isoformat(),
                               event_count=0)

    # Import here so a model/import error surfaces as an SSE error, not a 500.
    from agents.agentx_v2_0.agentic.agent import run_chat

    async def event_stream():
        try:
            async for chunk in run_chat(session_id, req.persona, req.user_id or "", req.message):
                yield chunk
        except Exception as exc:  # pragma: no cover - defensive
            logger.error("[ROUTE] chat_error  session_id=%s error=%s", session_id, exc)
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
            yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── Sessions ──────────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions():
    """List all runs/sessions, most recent first."""
    return {"sessions": service.list_sessions()}


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    """Return metadata for a single session (404 if missing)."""
    meta = service.get_session(session_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return meta


# ── Processing ────────────────────────────────────────────────────────────────

@router.post("/run")
async def run(req: RunRequest):
    """
    Start a processing run. Returns {session_id, run_id, status:"queued"} and
    launches run_pipeline as a detached asyncio task (survives client disconnect).
    Connect to GET /monitor/{session_id} for the SSE stream.
    """
    meta = service.create_session(persona=req.persona, trigger_mode="api",
                                  scenario_id=req.scenario_id)
    session_id = meta["session_id"]
    asyncio.create_task(service.run_pipeline(session_id))
    logger.info("[ROUTE] run_started  session_id=%s run_id=%s", session_id, meta["run_id"])
    return {"session_id": session_id, "run_id": meta["run_id"], "status": "queued"}


@router.get("/monitor/{session_id}")
async def monitor(session_id: str, last_event_id: Optional[str] = Header(None, alias="Last-Event-ID")):
    """
    SSE stream for a run. Honors Last-Event-ID: replays events.jsonl past that
    cursor, then attaches to the live queue. Ends on `done` / `error`.
    """
    if service.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        cursor = int(last_event_id) if last_event_id else 0
    except ValueError:
        cursor = 0

    async def event_stream():
        # 1) Replay persisted events past the cursor.
        history = service.get_event_log(session_id, after_id=cursor)
        for record in history:
            eid = record.get("id")
            if eid is None:
                yield f"data: {json.dumps(record)}\n\n"
            else:
                yield f"id: {eid}\ndata: {json.dumps(record)}\n\n"

        # 2) If already terminal and fully replayed, close.
        meta = service.get_session(session_id) or {}
        if meta.get("status") in _TERMINAL_RUN_STATUSES:
            if cursor + len(history) >= int(meta.get("event_count", 0)):
                yield f"data: {json.dumps({'type': 'already-complete', 'status': meta.get('status')})}\n\n"
                return

        # 3) Attach to the live queue for in-progress runs.
        queue = service.get_or_create_queue(session_id)
        seen_ids: set[int] = {r.get("id") for r in history if isinstance(r.get("id"), int)}
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                continue
            eid = event.get("id") if isinstance(event, dict) else None
            if isinstance(eid, int):
                if eid in seen_ids or eid <= cursor:
                    continue
                seen_ids.add(eid)
                yield f"id: {eid}\ndata: {json.dumps(event)}\n\n"
            else:
                yield f"data: {json.dumps(event)}\n\n"
            if isinstance(event, dict) and event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


# ── HITL approval ───────────────────────────────────────────────────────────

def _hitl_enabled() -> bool:
    return bool((load_config().get("features") or {}).get("hitl_approval"))


@router.post("/approve/{session_id}")
async def approve(session_id: str):
    """Approve a paused run. Returns approvals-disabled if HITL is off."""
    if not _hitl_enabled():
        return {"status": "approvals-disabled"}
    if service.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, "approve")
    if not resolved:
        raise HTTPException(status_code=404, detail="No pending approval for this session")
    return {"status": "approved"}


@router.post("/reject/{session_id}")
async def reject(session_id: str):
    """Reject a paused run. Returns approvals-disabled if HITL is off."""
    if not _hitl_enabled():
        return {"status": "approvals-disabled"}
    if service.get_session(session_id) is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, "reject")
    if not resolved:
        raise HTTPException(status_code=404, detail="No pending approval for this session")
    return {"status": "rejected"}


# ── Admin (self-restart) ──────────────────────────────────────────────────────

@router.post("/admin/restart")
async def admin_restart():
    """
    Gracefully self-restart the agent process so it re-reads agent.config.yaml.

    Re-execs the current process (sys.executable + sys.argv) after returning the
    response. Guarded so it only ever restarts — no other side effects.
    """
    logger.warning("[ROUTE] admin_restart  re-exec scheduled  argv=%s", sys.argv)

    async def _reexec_after_response():
        # Give the HTTP response a moment to flush before the process is replaced.
        await asyncio.sleep(0.5)
        logger.warning("[ROUTE] admin_restart  executing os.execv now")
        os.execv(sys.executable, [sys.executable, *sys.argv])

    asyncio.create_task(_reexec_after_response())
    return {"status": "restarting"}
