"""
Run engine + state for the v2.0 template agent.

Manages run lifecycle, the append-only per-session event log, live SSE queues,
the DURABLE HITL approval gate, a startup recovery pass (resume paused runs,
interrupt mid-compute ones), and the boot-time self-check.

Config model: agent.config.yaml is the git-tracked DEFINITION + defaults
(personas, capabilities, integration catalog). state/config/setup.yaml holds the
operator OVERRIDES written from the marketplace. Effective config = defaults ⊕
setup. When setup.yaml is absent the agent is `awaiting_setup` — it stays up so
the marketplace can configure it, but refuses to process.

IMPORTANT (single-worker invariant): the pipeline task awaiting approval and the
/approve handler resolving it run in the same uvicorn worker. Gate state is now
durable on disk (state/runs/), so it survives a restart — but the in-process wake
still assumes one worker. Do NOT add `--workers N` without a cross-process wake.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from commons.logger import get_logger  # noqa: E402
from agents.agentx_v2_0.agentic.approval_hook import ApprovalHook, APPROVE  # noqa: E402
from agents.agentx_v2_0.agentic.memory_backend import get_memory_store  # noqa: E402
from agents.agentx_v2_0.agentic.model import resolve_model_id  # noqa: E402
from agents.agentx_v2_0.agentic.paths import (  # noqa: E402
    CONFIG_DEF_FILE, RUN_SEQ_DIR, SESSIONS_DIR, SETUP_FILE,
    ensure_state_dirs, is_configured,
)

logger = get_logger(__name__)

# Canonical run statuses
_RUN_STATUS_RESUMABLE = {"awaiting_approval"}
_RUN_STATUS_INTERRUPTIBLE = {"queued", "running"}
_RUN_STATUS_TERMINAL = {"complete", "failed", "interrupted", "cancelled"}

_run_seq_lock = threading.Lock()

# The single approval item id the template pipeline gates on.
_GATE_ITEM_ID = "primary"
# Number of pre-gate pipeline steps (so resume can number the finalize step).
_STEP_COUNT = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, str(path))


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def mint_run_id(now: datetime | None = None) -> str:
    """
    Mint a server-side run id of the form RUN-YYYYMMDD-HHMMSS-NNNN.
    NNNN is a per-day counter persisted at state/_run_seq/YYYYMMDD.txt under a
    threading lock, so meta.run_id is set before /run returns to the client.
    """
    now = now or datetime.now(timezone.utc)
    day = now.strftime("%Y%m%d")
    seq_path = RUN_SEQ_DIR / f"{day}.txt"
    with _run_seq_lock:
        RUN_SEQ_DIR.mkdir(parents=True, exist_ok=True)
        try:
            current = int(seq_path.read_text(encoding="utf-8").strip())
        except (FileNotFoundError, ValueError):
            current = 0
        nxt = current + 1
        seq_path.write_text(str(nxt), encoding="utf-8")
    return f"RUN-{day}-{now.strftime('%H%M%S')}-{nxt:04d}"


# ── Config: definition (git) ⊕ operator setup (state) ─────────────────────────

def load_definition() -> dict:
    """Parse agent.config.yaml — the git-tracked definition + defaults."""
    try:
        return yaml.safe_load(CONFIG_DEF_FILE.read_text(encoding="utf-8")) or {}
    except (FileNotFoundError, yaml.YAMLError):
        return {}


def load_setup() -> dict | None:
    """Parse state/config/setup.yaml — operator overrides. None when not yet configured."""
    if not SETUP_FILE.exists():
        return None
    try:
        return yaml.safe_load(SETUP_FILE.read_text(encoding="utf-8")) or {}
    except yaml.YAMLError:
        return {}


def effective_config() -> dict:
    """
    Merge the definition with operator setup into the effective runtime config.
    Operator-editable keys: model_id, hitl_approval, per-integration `connected`.
    Always reports `configured` (whether setup.yaml exists yet).
    """
    defn = load_definition()
    setup = load_setup() or {}
    cfg = dict(defn)

    defaults = dict(defn.get("defaults") or {})
    features = dict(defn.get("features") or {})
    cfg["defaults"] = {**defaults, "model_id": setup.get("model_id", defaults.get("model_id", ""))}
    hitl_default = features.get("hitl_approval", defaults.get("hitl_approval", False))
    cfg["features"] = {**features, "hitl_approval": bool(setup.get("hitl_approval", hitl_default))}

    setup_integ = setup.get("integrations") or {}
    integrations = []
    for item in (defn.get("integrations") or []):
        item = dict(item)
        override = setup_integ.get(item.get("id")) or {}
        if "connected" in override:
            item["connected"] = bool(override["connected"])
        integrations.append(item)
    if integrations:
        cfg["integrations"] = integrations

    cfg["configured"] = is_configured()
    return cfg


# Back-compat: callers that read "the config" want the effective view.
load_config = effective_config


def save_setup(setup: dict) -> dict:
    """Persist operator setup to state/config/setup.yaml (used by POST /admin/setup)."""
    ensure_state_dirs()
    tmp = str(SETUP_FILE) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        yaml.safe_dump(setup, f, sort_keys=False, allow_unicode=True)
    os.replace(tmp, str(SETUP_FILE))
    logger.info("[SERVICE] setup_saved  keys=%s", sorted(setup.keys()))
    return effective_config()


def hitl_enabled() -> bool:
    return bool((effective_config().get("features") or {}).get("hitl_approval"))


class Service:
    """Run lifecycle, event log, SSE queues, durable HITL gate, and self-check."""

    def __init__(self) -> None:
        self._sessions: dict[str, dict] = {}
        self._queues: dict[str, asyncio.Queue] = {}
        self._approval = ApprovalHook()

    # ── Session management ────────────────────────────────────────────────────

    def create_session(
        self,
        persona: str = "end_user",
        trigger_mode: str = "api",
        scenario_id: str | None = None,
    ) -> dict:
        import uuid
        session_id = str(uuid.uuid4())
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        run_id = mint_run_id(now_dt)
        meta = {
            "session_id": session_id,
            "run_id": run_id,
            "persona": persona,
            "trigger_mode": trigger_mode,
            "scenario_id": scenario_id,
            "status": "queued",
            "created_at": now,
            "completed_at": None,
            "event_count": 0,
        }
        self._sessions[session_id] = meta
        _write_json(SESSIONS_DIR / f"{session_id}_meta.json", meta)
        logger.info("[SERVICE] create_session  session_id=%s run_id=%s mode=%s",
                    session_id, run_id, trigger_mode)
        return meta

    def get_session(self, session_id: str) -> dict | None:
        if session_id in self._sessions:
            return self._sessions[session_id]
        data = _read_json(SESSIONS_DIR / f"{session_id}_meta.json")
        if data:
            self._sessions[session_id] = data
        return data

    def list_sessions(self) -> list[dict]:
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        sessions = []
        for f in sorted(SESSIONS_DIR.glob("*_meta.json"),
                        key=lambda p: p.stat().st_mtime, reverse=True):
            data = _read_json(f)
            if data:
                sessions.append(data)
        return sessions

    def update_session(self, session_id: str, **kwargs) -> None:
        meta = self.get_session(session_id) or {}
        meta.update(kwargs)
        meta["session_id"] = session_id  # always recorded; can't be double-passed
        self._sessions[session_id] = meta
        _write_json(SESSIONS_DIR / f"{session_id}_meta.json", meta)

    def set_status(self, session_id: str, status: str, **extra: Any) -> None:
        """Update meta.status (+ optional fields) and persist atomically."""
        self.update_session(session_id, status=status, **extra)

    # ── SSE queue + event log (per-session events.jsonl, monotonic id) ────────

    def get_or_create_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._queues:
            self._queues[session_id] = asyncio.Queue()
        return self._queues[session_id]

    def _next_event_id(self, session_id: str) -> int:
        meta = self.get_session(session_id) or {}
        n = int(meta.get("event_count", 0)) + 1
        meta["event_count"] = n
        self._sessions[session_id] = meta
        _write_json(SESSIONS_DIR / f"{session_id}_meta.json", meta)
        return n

    def _append_event_jsonl(self, session_id: str, record: dict) -> None:
        path = SESSIONS_DIR / f"{session_id}.events.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    async def emit(self, session_id: str, event: dict) -> None:
        """Stamp an event with a monotonic id, persist it, and push to the live queue."""
        q = self.get_or_create_queue(session_id)
        # Heartbeats are live-only — never persisted, never id-stamped.
        if event.get("type") == "heartbeat":
            await q.put(event)
            return
        eid = self._next_event_id(session_id)
        record = {"id": eid, "ts": _now_iso(), **event}
        self._append_event_jsonl(session_id, record)
        await q.put(record)

    def get_event_log(self, session_id: str, after_id: int = 0) -> list:
        """Return persisted events for a session, filtered to id > after_id."""
        events: list[dict] = []
        path = SESSIONS_DIR / f"{session_id}.events.jsonl"
        if not path.exists():
            return events
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get("id", 0) > after_id:
                    events.append(rec)
        return events

    # ── HITL approval gate ────────────────────────────────────────────────────

    def resolve_approval(self, session_id: str, decision: str) -> bool:
        """Resolve the open approval gate for a session. Returns True if found."""
        return self._approval.resolve(session_id, _GATE_ITEM_ID, decision)

    # ── Generic pipeline ──────────────────────────────────────────────────────

    async def run_pipeline(self, session_id: str) -> None:
        """
        Execute the generic template pipeline:
          emit a few `pipeline-step` events → (optional) durable HITL gate →
          finalize. A real agent replaces the step bodies while keeping the event
          shapes and the gate intact.
        """
        meta = self.get_session(session_id) or {}
        scenario_id = meta.get("scenario_id")

        self.set_status(session_id, "running", started_at=_now_iso())
        await self.emit(session_id, {"type": "run-started", "scenario_id": scenario_id})

        steps = [
            ("ingest", "Collecting and validating input"),
            ("analyze", "Analysing input against rules"),
            ("decide", "Forming a recommendation"),
        ]
        try:
            for i, (name, desc) in enumerate(steps, start=1):
                await self.emit(session_id, {"type": "pipeline-step", "step": i, "name": name,
                                             "status": "running", "detail": desc})
                await asyncio.sleep(0)  # cooperative yield; real work goes here
                await self.emit(session_id, {"type": "pipeline-step", "step": i, "name": name,
                                             "status": "complete"})

            hitl_on = hitl_enabled()
            if hitl_on:
                self._approval.open_gate(session_id, _GATE_ITEM_ID)
                self.set_status(session_id, "awaiting_approval")
                await self.emit(session_id, {
                    "type": "human-approval-required",
                    "item_id": _GATE_ITEM_ID,
                    "reason": "Recommendation requires human approval before completion.",
                })
                await self.emit(session_id, {"type": "status-change", "status": "awaiting_approval"})
                logger.info("[SERVICE] awaiting_approval  session_id=%s", session_id)
                decision = await self._approval.wait(session_id, _GATE_ITEM_ID, timeout=1200)
            else:
                decision = APPROVE

            await self._finalize(session_id, decision, hitl_on)
        except Exception as e:
            await self._fail(session_id, e)

    async def _finalize(self, session_id: str, decision: str, hitl_on: bool) -> None:
        """Post-gate completion — shared by first run and post-restart resume."""
        meta = self.get_session(session_id) or {}
        try:
            if hitl_on:
                self.set_status(session_id, "running")
                await self.emit(session_id, {"type": "status-change", "status": "running"})
                await self.emit(session_id, {"type": "approval-decision",
                                             "decision": "approved" if decision == APPROVE else "rejected"})

            outcome = "approved" if decision == APPROVE else "rejected"
            await self.emit(session_id, {"type": "pipeline-step", "step": _STEP_COUNT + 1,
                                         "name": "finalize", "status": "complete", "outcome": outcome})
            self.set_status(session_id, "complete", completed_at=_now_iso(), outcome=outcome)
            await self.emit(session_id, {"type": "done", "run_id": meta.get("run_id"), "outcome": outcome})
            self._record_episode(meta, outcome)
            logger.info("[SERVICE] pipeline_complete  session_id=%s outcome=%s", session_id, outcome)
        except Exception as e:
            await self._fail(session_id, e)

    async def _fail(self, session_id: str, error: Exception) -> None:
        meta = self.get_session(session_id) or {}
        logger.error("[SERVICE] pipeline_failed  session_id=%s error=%s", session_id, error)
        self.set_status(session_id, "failed", completed_at=_now_iso(), error=str(error))
        await self.emit(session_id, {"type": "error", "message": str(error)})
        await self.emit(session_id, {"type": "done", "run_id": meta.get("run_id"), "outcome": "failed"})

    def _record_episode(self, meta: dict, outcome: str) -> None:
        """Append a one-line episodic memory of the finished run (best-effort)."""
        try:
            get_memory_store().add_episode({
                "run_id": meta.get("run_id"),
                "session_id": meta.get("session_id"),
                "scenario_id": meta.get("scenario_id"),
                "outcome": outcome,
            })
        except Exception as e:  # pragma: no cover - memory must never break a run
            logger.warning("[SERVICE] episode_write_failed  error=%s", e)

    # ── Startup recovery (called from FastAPI startup) ────────────────────────

    async def recover_on_startup(self) -> dict:
        """
        Reconcile runs left non-terminal by a stop/crash:
          • awaiting_approval → RESUME — re-arm a waiter so a pending approval is
            honoured (or finalize now if it was decided while the process was down).
          • queued / running  → INTERRUPT — mid-compute work can't be safely resumed.
        Returns {"resumed": n, "interrupted": m}.
        """
        SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        resumed = interrupted = 0
        now = _now_iso()
        for meta_path in SESSIONS_DIR.glob("*_meta.json"):
            meta = _read_json(meta_path)
            if not meta:
                continue
            status = meta.get("status")
            session_id = meta.get("session_id", "")
            if status in _RUN_STATUS_RESUMABLE and self._approval.is_open(session_id):
                self._sessions[session_id] = meta
                asyncio.create_task(self._resume_pending(session_id))
                resumed += 1
                logger.info("[SERVICE] run_resumed_on_startup  session_id=%s", session_id)
            elif status in _RUN_STATUS_INTERRUPTIBLE or (
                status in _RUN_STATUS_RESUMABLE and not self._approval.is_open(session_id)
            ):
                eid = int(meta.get("event_count", 0)) + 1
                meta.update(status="interrupted", completed_at=now, event_count=eid)
                _write_json(meta_path, meta)
                self._sessions[session_id] = meta
                self._append_event_jsonl(session_id, {
                    "id": eid, "ts": now, "type": "run-interrupted",
                    "reason": "process_died_before_completion", "prior_status": status,
                })
                interrupted += 1
                logger.warning("[SERVICE] run_interrupted_on_startup  session_id=%s prior=%s",
                               session_id, status)
        if resumed or interrupted:
            logger.info("[SERVICE] startup_recovery  resumed=%d interrupted=%d", resumed, interrupted)
        return {"resumed": resumed, "interrupted": interrupted}

    async def _resume_pending(self, session_id: str) -> None:
        """Re-arm the durable gate for a paused run and finalize when it resolves."""
        await self.emit(session_id, {"type": "run-resumed",
                                     "detail": "Reattached to a pending approval after restart."})
        decision = await self._approval.wait(session_id, _GATE_ITEM_ID, timeout=1200)
        await self._finalize(session_id, decision, hitl_on=True)

    # ── Startup self-check (feeds GET /ping) ──────────────────────────────────

    @staticmethod
    def self_check() -> dict:
        """
        Validate readiness on boot and on demand. Returns:
          {"status": "awaiting_setup"|"ok"|"degraded", "checks": [{name, ok, detail}, ...]}
        """
        if not is_configured():
            return {
                "status": "awaiting_setup",
                "checks": [{
                    "name": "setup",
                    "ok": False,
                    "detail": "No state/config/setup.yaml — configure this agent from the marketplace.",
                }],
            }

        checks: list[dict] = []

        # 1) Definition parses and declares personas.
        cfg = effective_config()
        cfg_ok = bool(cfg.get("personas"))
        checks.append({
            "name": "agent_config",
            "ok": cfg_ok,
            "detail": "parsed OK" if cfg_ok else "agent.config.yaml missing/invalid or has no personas",
        })

        # 2) A model id resolves (setup → agent.config.yaml → env → root default).
        try:
            model_id = resolve_model_id()
            model_ok = bool(model_id)
            detail = f"resolved model_id={model_id}" if model_ok else "no model id resolved"
        except Exception as e:  # pragma: no cover - defensive
            model_ok = False
            detail = f"model resolution failed: {e}"
        checks.append({"name": "bedrock_model", "ok": model_ok, "detail": detail})

        # 3) AWS region present (env or root config default — model.py guarantees a default).
        region = os.getenv("AWS_REGION", "")
        checks.append({
            "name": "aws_region",
            "ok": True,
            "detail": f"AWS_REGION={region}" if region else "using root config default region",
        })

        status = "ok" if all(c["ok"] for c in checks) else "degraded"
        return {"status": status, "checks": checks}
