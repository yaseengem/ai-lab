"""
Pipeline service layer for the Settlement Failure Prevention Agent.

Manages session lifecycle, SSE event queues, human approval gates, pipeline state,
and run history aggregation for the Summary Dashboard.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
import sys
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from commons.logger import get_logger  # noqa: E402

logger = get_logger(__name__)

_AGENT_DIR = Path(__file__).parent.parent  # agents/demo4/
_SESSIONS_DIR = _AGENT_DIR / "data" / "sessions"
_UPLOADS_DIR = _AGENT_DIR / "data" / "uploads"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, str(path))


def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


class PipelineService:
    def __init__(self) -> None:
        # In-memory state (lost on restart — pipeline state is also persisted to disk)
        self._sessions: dict[str, dict] = {}
        self._queues: dict[str, asyncio.Queue] = {}
        self._approval_futures: dict[str, dict[str, asyncio.Future]] = {}
        self._pipeline_states: dict[str, dict] = {}
        self._event_logs: dict[str, list] = {}

    # ── Session management ────────────────────────────────────────────────────

    def create_session(self, trigger_mode: str = "api", upload_id: str | None = None) -> dict:
        session_id = str(uuid.uuid4())
        now = _now_iso()
        meta = {
            "session_id": session_id,
            "trigger_mode": trigger_mode,
            "upload_id": upload_id,
            "status": "pending",
            "run_id": None,
            "execution_status": None,
            "created_at": now,
            "completed_at": None,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
            "interventions_executed": 0,
            "systemic_stress": False,
        }
        self._sessions[session_id] = meta
        self._pipeline_states[session_id] = {
            "session_id": session_id,
            "status": "pending",
            "trigger_mode": trigger_mode,
            "steps": [
                {"step": i, "agent_name": name, "status": "waiting"}
                for i, name in enumerate([
                    "", "DataIngestionAgent", "RiskScoringAgent", "CounterpartyRiskAgent",
                    "InterventionDecisionAgent", "LOLRExecutionAgent", "SettlementRollAgent",
                    "ReportingAuditAgent",
                ], start=0) if i > 0
            ],
            "pending_approvals": [],
            "risk_summary": None,
            "intervention_plan": None,
            "fsca_report": None,
            "created_at": now,
            "completed_at": None,
        }
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)
        logger.info("[SERVICE] create_session  session_id=%s mode=%s", session_id, trigger_mode)
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
        for f in sorted(_SESSIONS_DIR.glob("*_meta.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            data = _read_json(f)
            if data:
                sessions.append(data)
        return sessions

    def update_session(self, session_id: str, **kwargs) -> None:
        session = self._sessions.get(session_id, {})
        session.update(kwargs)
        self._sessions[session_id] = session
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", session)

    # ── Pipeline state ────────────────────────────────────────────────────────

    def get_pipeline_state(self, session_id: str) -> dict | None:
        if session_id in self._pipeline_states:
            return self._pipeline_states[session_id]
        data = _read_json(_SESSIONS_DIR / f"{session_id}_state.json")
        if data:
            self._pipeline_states[session_id] = data
        return data

    def update_step(self, session_id: str, step: int, **kwargs) -> None:
        state = self._pipeline_states.get(session_id, {})
        steps = state.get("steps", [])
        for s in steps:
            if s.get("step") == step:
                s.update(kwargs)
                break
        state["steps"] = steps
        self._pipeline_states[session_id] = state
        _write_json(_SESSIONS_DIR / f"{session_id}_state.json", state)

    def set_pipeline_field(self, session_id: str, **kwargs) -> None:
        state = self._pipeline_states.get(session_id, {})
        state.update(kwargs)
        self._pipeline_states[session_id] = state
        _write_json(_SESSIONS_DIR / f"{session_id}_state.json", state)

    # ── SSE queue ─────────────────────────────────────────────────────────────

    def get_or_create_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._queues:
            self._queues[session_id] = asyncio.Queue()
        return self._queues[session_id]

    async def emit(self, session_id: str, event: dict) -> None:
        q = self.get_or_create_queue(session_id)
        await q.put(event)
        if event.get("type") != "heartbeat":
            log = self._event_logs.setdefault(session_id, [])
            log.append({**event, "_ts": _now_iso()})
            _write_json(_SESSIONS_DIR / f"{session_id}_events.json", {"events": log})

    def get_event_log(self, session_id: str) -> list:
        if session_id in self._event_logs:
            return self._event_logs[session_id]
        data = _read_json(_SESSIONS_DIR / f"{session_id}_events.json")
        return data.get("events", []) if data else []

    def emit_threadsafe(self, session_id: str, event: dict, loop: asyncio.AbstractEventLoop) -> None:
        q = self.get_or_create_queue(session_id)
        loop.call_soon_threadsafe(q.put_nowait, event)

    # ── Human approval gate ───────────────────────────────────────────────────

    def create_approval_future(self, session_id: str, item_id: str) -> asyncio.Future:
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        if session_id not in self._approval_futures:
            self._approval_futures[session_id] = {}
        self._approval_futures[session_id][item_id] = future
        return future

    def resolve_approval(self, session_id: str, item_id: str, decision: str) -> bool:
        futures = self._approval_futures.get(session_id, {})
        future = futures.get(item_id)
        if future and not future.done():
            future.set_result(decision)
            logger.info("[SERVICE] approval_resolved  session_id=%s item_id=%s decision=%s",
                        session_id, item_id, decision)
            return True
        logger.warning("[SERVICE] approval_not_found  session_id=%s item_id=%s", session_id, item_id)
        return False

    def add_pending_approval(self, session_id: str, item: dict) -> None:
        state = self._pipeline_states.get(session_id, {})
        approvals = state.get("pending_approvals", [])
        # Don't add duplicate
        if not any(a.get("item_id") == item.get("item_id") for a in approvals):
            approvals.append(item)
        state["pending_approvals"] = approvals
        self._pipeline_states[session_id] = state

    def remove_pending_approval(self, session_id: str, item_id: str) -> None:
        state = self._pipeline_states.get(session_id, {})
        approvals = [a for a in state.get("pending_approvals", []) if a.get("item_id") != item_id]
        state["pending_approvals"] = approvals
        self._pipeline_states[session_id] = state

    # ── Upload management ─────────────────────────────────────────────────────

    def get_upload_path(self, upload_id: str) -> Path | None:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        for f in _UPLOADS_DIR.iterdir():
            if f.stem.startswith(upload_id):
                return f
        return None

    def save_upload(self, filename: str, contents: bytes) -> str:
        _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
        upload_id = str(uuid.uuid4())[:8]
        suffix = Path(filename).suffix.lower()
        dest = _UPLOADS_DIR / f"{upload_id}_{filename}"
        dest.write_bytes(contents)
        logger.info("[SERVICE] upload_saved  upload_id=%s file=%s bytes=%d", upload_id, filename, len(contents))
        return upload_id

    # ── Summary aggregation ───────────────────────────────────────────────────

    def get_summary(self) -> dict:
        sessions = self.list_sessions()
        completed = [s for s in sessions if s.get("execution_status") in ("SUCCESS", "PARTIAL")]

        total_trades = 0
        total_lolr = 0
        total_rolls = 0
        total_alerts = 0
        total_escalations = 0
        total_value_protected = 0
        systemic_runs = 0
        risk_by_run = []
        trend_data = []

        for s in completed:
            state = _read_json(_SESSIONS_DIR / f"{s['session_id']}_state.json") or {}
            risk_summary = state.get("risk_summary") or {}
            ops = state.get("operations_summary") or {}

            trades = ops.get("total_trades_monitored", 0)
            total_trades += trades
            total_lolr += ops.get("lolr_executed", 0)
            total_rolls += ops.get("rolls_executed", 0)
            total_alerts += ops.get("alerts_sent", 0)
            total_escalations += ops.get("human_escalations", 0)
            total_value_protected += ops.get("settlement_value_protected_zar", 0)
            if s.get("systemic_stress"):
                systemic_runs += 1

            risk_by_run.append({
                "session_id": s["session_id"],
                "run_id": s.get("run_id", ""),
                "created_at": s.get("created_at", ""),
                "critical": s.get("critical_count", 0),
                "high": s.get("high_count", 0),
                "medium": s.get("medium_count", 0),
                "low": s.get("low_count", 0),
                "trigger_mode": s.get("trigger_mode", "api"),
            })
            trend_data.append({
                "date": s.get("created_at", "")[:10],
                "critical_count": s.get("critical_count", 0),
            })

        recent = []
        for s in sessions[:10]:
            recent.append({
                "session_id": s["session_id"],
                "run_id": s.get("run_id"),
                "created_at": s.get("created_at"),
                "trigger_mode": s.get("trigger_mode", "api"),
                "status": s.get("status"),
                "execution_status": s.get("execution_status"),
                "critical_count": s.get("critical_count", 0),
                "interventions_executed": s.get("interventions_executed", 0),
                "systemic_stress": s.get("systemic_stress", False),
            })

        n = len(completed) or 1
        return {
            "total_runs": len(sessions),
            "completed_runs": len(completed),
            "total_trades_monitored": total_trades,
            "avg_critical_per_run": round(sum(s.get("critical_count", 0) for s in completed) / n, 1),
            "total_lolr_executed": total_lolr,
            "total_rolls_executed": total_rolls,
            "total_alerts_sent": total_alerts,
            "total_human_escalations": total_escalations,
            "total_settlement_value_protected_zar": total_value_protected,
            "systemic_stress_runs": systemic_runs,
            "recent_runs": recent,
            "risk_distribution_by_run": risk_by_run,
            "intervention_breakdown": {
                "LOLR_TRIGGER": total_lolr,
                "SETTLEMENT_ROLL": total_rolls,
                "ALERT_OPERATIONS": total_alerts,
                "HUMAN_ESCALATION": total_escalations,
            },
            "trend_data": trend_data,
        }
