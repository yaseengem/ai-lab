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
from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from commons.logger import get_logger

from agents.agent5.agentic.paths import is_configured
from agents.agent5.agentic.tools import auth as auth_tool

from .schemas import AuthRequest, AuthVerify, ChatRequest, RunRequest
from .service import Service, load_config, save_setup

logger = get_logger(__name__)

router = APIRouter()
service = Service()


def _require_configured() -> None:
    """Block processing endpoints until the operator has configured the agent."""
    if not is_configured():
        raise HTTPException(
            status_code=409,
            detail="Agent is awaiting setup — configure it from the marketplace before processing.",
        )


def _require_session(token: Optional[str]) -> dict:
    """Enforce the SES email-OTP gate. Returns the session (with verified email) or 401."""
    session = auth_tool.check_session(token)
    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Not verified — complete email verification (POST /auth/request → /auth/verify).",
        )
    return session

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
    """
    Return the effective config: the git-tracked definition (personas,
    capabilities, integration catalog) merged with operator setup overrides.
    Carries `configured` so the marketplace can render the form pre-setup.
    """
    return load_config()


@router.get("/personas")
def get_personas():
    """Return the persona definitions from the agent definition."""
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


# ── Authentication (SES email-OTP gate) ───────────────────────────────────────

@router.post("/auth/request")
def auth_request(req: AuthRequest):
    """
    Validate a work email and send a one-time verification code via AWS SES.
    Rejects public/free email domains and anything outside the allowlist (HTTP 200 with
    {ok:false, reason}). When SES is not configured, returns the code as `dev_code` so the
    flow stays testable with zero AWS setup.
    """
    result = auth_tool.request_otp(req.email)
    if not result.get("ok"):
        logger.info("[AUTH] request_rejected  reason=%s", result.get("reason"))
    return result


@router.post("/auth/verify")
def auth_verify(req: AuthVerify):
    """Verify the one-time code; on success returns {ok:true, token, email}."""
    result = auth_tool.verify_otp(req.email, req.code)
    return result


@router.get("/auth/status")
def auth_status(x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token")):
    """Report whether the caller's token is a valid verified session."""
    session = auth_tool.check_session(x_auth_token)
    if session is None:
        return {"verified": False}
    return {"verified": True, "email": session.get("email")}


# ── Memory ────────────────────────────────────────────────────────────────────

@router.get("/memory")
def get_memory():
    """Return the agent's memory — procedural rules, semantic facts, episodic log."""
    from agents.agent5.agentic.memory_backend import get_memory_store
    return {"memory": get_memory_store().snapshot()}


# ── Chat (SSE) ────────────────────────────────────────────────────────────────

@router.post("/chat/{session_id}")
async def chat(session_id: str, req: ChatRequest,
               x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token")):
    """
    Operations-aware, persona-aware streaming chat (SSE).
    Requires a verified session (SES email-OTP gate). Creates the chat session if new.
    The verified email is used as the user_id so tools can pre-fill it.
    """
    _require_configured()
    auth_session = _require_session(x_auth_token)
    req.user_id = req.user_id or auth_session.get("email")
    if service.get_session(session_id) is None:
        # Lightweight chat session — reuse the meta shape via create_session is
        # heavier than needed, so persist a minimal chat meta directly.
        service.update_session(session_id, session_id=session_id, persona=req.persona,
                               trigger_mode="chat", status="chat", run_id=None,
                               created_at=datetime.now(timezone.utc).isoformat(),
                               event_count=0)

    # Import here so a model/import error surfaces as an SSE error, not a 500.
    from agents.agent5.agentic.agent import run_chat

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


# ── Voice (Nova Sonic, bidirectional WebSocket) ───────────────────────────────

def _voice_system_prompt(persona: str, email: str) -> str:
    """Build the Sonic supervisor prompt (same prompt + grounding the text path uses)."""
    from agents.agent5.agentic import knowledge
    from agents.agent5.agentic.prompts import SYSTEM_PROMPT, persona_instruction
    try:
        overview = knowledge.overview_text()
    except Exception:
        overview = ""
    return (
        f"{SYSTEM_PROMPT}\n\n=== TRIANZ OVERVIEW ===\n{overview}\n"
        f"\n=== SESSION ===\nPersona: {persona}\nVisitor email: {email or 'unknown'}\n"
        f"{persona_instruction(persona)}\n"
    )


@router.websocket("/voice/{session_id}")
async def voice(websocket: WebSocket, session_id: str):
    """
    Real-time voice via Amazon Nova Sonic over a bidirectional Bedrock stream.

    The browser connects with ?token=<verified session token>&persona=<id>. Audio frames
    (16 kHz PCM, base64) and control messages arrive as JSON; transcript / 24 kHz audio /
    tool-status / error events are sent back as JSON. Falls back gracefully (a single
    `error` with `fallback:true`) when not configured or the voice SDK is unavailable.
    """
    await websocket.accept()
    token = websocket.query_params.get("token")
    persona = websocket.query_params.get("persona", "visitor")

    session = auth_tool.check_session(token)
    if session is None:
        await websocket.send_json({"type": "error", "message": "not verified", "fallback": False})
        await websocket.close()
        return
    if not is_configured():
        await websocket.send_json({"type": "error", "message": "awaiting setup", "fallback": True})
        await websocket.close()
        return

    from agents.agent5.agentic import sonic_session as sonic
    ok, detail = sonic.available()
    if not ok:
        await websocket.send_json({"type": "error", "message": detail, "fallback": True})
        await websocket.close()
        return

    email = session.get("email", "")
    sess = sonic.SonicSession(system_prompt=_voice_system_prompt(persona, email), visitor_email=email)

    async def pump_out():
        async for event in sess.events():
            await websocket.send_json(event)

    out_task = None
    try:
        await sess.start()
        await sess.begin_audio()
        out_task = asyncio.create_task(pump_out())
        while True:
            msg = await websocket.receive_json()
            kind = msg.get("type")
            if kind == "audio":
                await sess.send_audio(msg.get("audio", ""))
            elif kind == "text":
                # Cross-modal: inject a typed turn mid-voice-session.
                await sess._send_system_text(f"[The visitor typed]: {msg.get('text','')}")
            elif kind == "stop":
                break
    except WebSocketDisconnect:
        logger.info("[ROUTE] voice_disconnect  session_id=%s", session_id)
    except Exception as exc:  # pragma: no cover - depends on live AWS
        logger.error("[ROUTE] voice_error  session_id=%s error=%s", session_id, exc)
        try:
            await websocket.send_json({"type": "error", "message": str(exc), "fallback": True})
        except Exception:
            pass
    finally:
        await sess.close()
        if out_task is not None:
            out_task.cancel()


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
async def run(req: RunRequest,
              x_auth_token: Optional[str] = Header(None, alias="X-Auth-Token")):
    """
    Start a processing run. Returns {session_id, run_id, status:"queued"} and
    launches run_pipeline as a detached asyncio task (survives client disconnect).
    Connect to GET /monitor/{session_id} for the SSE stream. Requires a verified session.
    """
    _require_configured()
    _require_session(x_auth_token)
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


# ── Admin (setup + self-restart) ──────────────────────────────────────────────

@router.post("/admin/setup")
async def admin_setup(setup: dict):
    """
    Persist operator setup to state/config/setup.yaml (model_id, hitl_approval,
    integration connections). Marketplace-equivalent write — also creatable by the
    platform writing the file directly while the agent is stopped. Restart-required:
    call POST /admin/restart afterwards to apply. Returns the new effective config.
    """
    logger.info("[ROUTE] admin_setup  keys=%s", sorted(setup.keys()))
    return {"status": "saved", "config": save_setup(setup)}


@router.post("/admin/restart")
async def admin_restart():
    """
    Gracefully self-restart the agent so it re-reads its definition + setup.yaml.

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
