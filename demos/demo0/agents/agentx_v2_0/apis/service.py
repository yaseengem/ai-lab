"""
Run engine + state for the v2.0 template agent.

Manages run lifecycle, the append-only event log (events.jsonl), per-session
live SSE queues, the HITL approval gate, a startup crash-recovery sweep, and a
boot-time self-check.

IMPORTANT (single-worker invariant): HITL approval futures live in a
process-local registry (the ApprovalHook). The pipeline task awaiting approval
and the /approve route handler that resolves it must run in the same process.
The agent runs with a single uvicorn worker — do NOT add `--workers N` without
first replacing the in-memory future registry with a cross-process resume
mechanism (e.g. file + filesystem watcher, or Redis pub/sub).
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
from agents.agentx_v2_0.agentic.model import resolve_model_id  # noqa: E402

logger = get_logger(__name__)

_AGENT_DIR = Path(__file__).parent.parent          # agents/agentx_v2_0/
_SESSIONS_DIR = _AGENT_DIR / "data" / "sessions"
_RUN_SEQ_DIR = _AGENT_DIR / "data" / "_run_seq"
_CONFIG_FILE = _AGENT_DIR / "agent.config.yaml"

# Canonical run statuses
_RUN_STATUS_NON_TERMINAL = {"queued", "running", "awaiting_approval"}
_RUN_STATUS_TERMINAL = {"complete", "failed", "interrupted", "cancelled"}

_run_seq_lock = threading.Lock()

# The single approval item id the template pipeline gates on.
_GATE_ITEM_ID = "primary"


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
    NNNN is a per-day counter persisted at data/_run_seq/YYYYMMDD.txt under a
    threading lock, so meta.run_id is set before /run returns to the client.
    """
    now = now or datetime.now(timezone.utc)
    day = now.strftime("%Y%m%d")
    seq_path = _RUN_SEQ_DIR / f"{day}.txt"
    with _run_seq_lock:
        _RUN_SEQ_DIR.mkdir(parents=True, exist_ok=True)
        try:
            current = int(seq_path.read_text(encoding="utf-8").strip())
        except (FileNotFoundError, ValueError):
            current = 0
        nxt = current + 1
        seq_path.write_text(str(nxt), encoding="utf-8")
    return f"RUN-{day}-{now.strftime('%H%M%S')}-{nxt:04d}"


def load_config() -> dict:
    """Parse agent.config.yaml (returns {} on parse failure)."""
    try:
        return yaml.safe_load(_CONFIG_FILE.read_text(encoding="utf-8")) or {}
    except (FileNotFoundError, yaml.YAMLError):
        return {}


class Service:
    """Run lifecycle, event log, SSE queues, HITL gate, and self-check."""

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
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)
        logger.info("[SERVICE] create_session  session_id=%s run_id=%s mode=%s",
                    session_id, run_id, trigger_mode)
        return meta

    def get_session(self, session_id: str) -> dict | None:
        if session_id in self._sessions:
            return self._sessions[session_id]
        data = _read_json(_SESSIONS_DIR / f"{session_id}_meta.json")
        if data:
            self._sessions[session_id] = data
        return data

    def list_sessions(self) -> list[dict]:
        _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        sessions = []
        for f in sorted(_SESSIONS_DIR.glob("*_meta.json"),
                        key=lambda p: p.stat().st_mtime, reverse=True):
            data = _read_json(f)
            if data:
                sessions.append(data)
        return sessions

    def update_session(self, session_id: str, **kwargs) -> None:
        meta = self.get_session(session_id) or {}
        meta.update(kwargs)
        self._sessions[session_id] = meta
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)

    def set_status(self, session_id: str, status: str, **extra: Any) -> None:
        """Update meta.status (+ optional fields) and persist atomically."""
        self.update_session(session_id, status=status, **extra)

    # ── SSE queue + event log (events.jsonl, monotonic id) ────────────────────

    def get_or_create_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._queues:
            self._queues[session_id] = asyncio.Queue()
        return self._queues[session_id]

    def _next_event_id(self, session_id: str) -> int:
        meta = self.get_session(session_id) or {}
        n = int(meta.get("event_count", 0)) + 1
        meta["event_count"] = n
        self._sessions[session_id] = meta
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)
        return n

    def _append_event_jsonl(self, session_id: str, record: dict) -> None:
        path = _SESSIONS_DIR / f"{session_id}.events.jsonl"
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
        path = _SESSIONS_DIR / f"{session_id}.events.jsonl"
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
          emit a few `pipeline-step` events → (optional) HITL approval gate →
          `done` event, status `complete`.

        This is a domain-free skeleton — a real agent replaces the step bodies
        with its own work while keeping the event shapes and the gate intact.
        """
        async def emit(event: dict) -> None:
            await self.emit(session_id, event)

        meta = self.get_session(session_id) or {}
        scenario_id = meta.get("scenario_id")

        self.set_status(session_id, "running", started_at=_now_iso())
        await emit({"type": "run-started", "scenario_id": scenario_id})

        steps = [
            ("ingest", "Collecting and validating input"),
            ("analyze", "Analysing input against rules"),
            ("decide", "Forming a recommendation"),
        ]
        try:
            for i, (name, desc) in enumerate(steps, start=1):
                await emit({"type": "pipeline-step", "step": i, "name": name,
                            "status": "running", "detail": desc})
                await asyncio.sleep(0)  # cooperative yield; real work goes here
                await emit({"type": "pipeline-step", "step": i, "name": name,
                            "status": "complete"})

            # ── Optional HITL approval gate ──────────────────────────────────
            hitl_on = bool((load_config().get("features") or {}).get("hitl_approval"))
            decision = APPROVE
            if hitl_on:
                self.set_status(session_id, "awaiting_approval")
                await emit({
                    "type": "human-approval-required",
                    "item_id": _GATE_ITEM_ID,
                    "reason": "Recommendation requires human approval before completion.",
                })
                await emit({"type": "status-change", "status": "awaiting_approval"})
                logger.info("[SERVICE] awaiting_approval  session_id=%s", session_id)

                decision = await self._approval.wait(session_id, _GATE_ITEM_ID, timeout=1200)
                self.set_status(session_id, "running")
                await emit({"type": "status-change", "status": "running"})
                await emit({"type": "approval-decision",
                            "decision": "approved" if decision == APPROVE else "rejected"})

            outcome = "approved" if decision == APPROVE else "rejected"
            await emit({"type": "pipeline-step", "step": len(steps) + 1, "name": "finalize",
                        "status": "complete", "outcome": outcome})

            self.set_status(session_id, "complete",
                            completed_at=_now_iso(), outcome=outcome)
            await emit({"type": "done", "run_id": meta.get("run_id"), "outcome": outcome})
            logger.info("[SERVICE] pipeline_complete  session_id=%s outcome=%s", session_id, outcome)
        except Exception as e:
            logger.error("[SERVICE] pipeline_failed  session_id=%s error=%s", session_id, e)
            self.set_status(session_id, "failed", completed_at=_now_iso(), error=str(e))
            await emit({"type": "error", "message": str(e)})
            await emit({"type": "done", "run_id": meta.get("run_id"), "outcome": "failed"})

    # ── Crash-recovery sweep (called from FastAPI startup) ────────────────────

    def startup_sweep(self) -> int:
        """
        Mark any run whose status is non-terminal as 'interrupted'. Single-worker
        invariant: no other process owns these runs, so we can rewrite them.
        Returns the number of runs swept.
        """
        _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
        swept = 0
        now = _now_iso()
        for meta_path in _SESSIONS_DIR.glob("*_meta.json"):
            meta = _read_json(meta_path)
            if not meta:
                continue
            current = meta.get("status")
            if current in _RUN_STATUS_NON_TERMINAL:
                eid = int(meta.get("event_count", 0)) + 1
                meta["status"] = "interrupted"
                meta["completed_at"] = now
                meta["event_count"] = eid
                _write_json(meta_path, meta)
                self._sessions[meta.get("session_id", "")] = meta
                self._append_event_jsonl(meta["session_id"], {
                    "id": eid, "ts": now, "type": "run-interrupted",
                    "reason": "process_died_before_completion", "prior_status": current,
                })
                swept += 1
                logger.warning("[SERVICE] run_interrupted_on_startup  session_id=%s prior=%s",
                               meta.get("session_id"), current)
        if swept:
            logger.info("[SERVICE] startup_sweep  swept=%d", swept)
        return swept

    # ── Startup self-check (feeds GET /ping) ──────────────────────────────────

    @staticmethod
    def self_check() -> dict:
        """
        Validate config/env on boot and on demand. Returns:
          {"status": "ok"|"degraded", "checks": [{name, ok, detail}, ...]}
        """
        checks: list[dict] = []

        # 1) agent.config.yaml parses and has the expected top-level keys.
        cfg = load_config()
        cfg_ok = bool(cfg) and "personas" in cfg and "features" in cfg
        checks.append({
            "name": "agent_config",
            "ok": cfg_ok,
            "detail": "parsed OK" if cfg_ok else "agent.config.yaml missing/invalid or missing keys",
        })

        # 2) A model id resolves (agent.config.yaml → env → root config default).
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
