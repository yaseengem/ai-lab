"""
Pipeline service layer for the Settlement Failure Prevention Agent.

Manages run lifecycle, SSE event queues, human approval gates, pipeline state,
and run history aggregation for the Summary Dashboard.

IMPORTANT: This service holds approval futures in a process-local dict
(_approval_futures). The agent task awaiting approval and the /approve route
handler that resolves it must live in the same process. The agent runs with
a single uvicorn worker — do NOT add `--workers N` without first replacing
the in-memory future dict with a cross-process resume mechanism (e.g. file +
filesystem watcher, or Redis pub/sub).
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
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
_RUN_SEQ_DIR = _AGENT_DIR / "data" / "_run_seq"

# Run statuses persisted on meta.json
_RUN_STATUS_NON_TERMINAL = {"pending", "queued", "running", "awaiting_approval"}
_RUN_STATUS_TERMINAL = {"complete", "failed", "interrupted", "cancelled"}

_run_seq_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def mint_run_id(now: datetime | None = None) -> str:
    """
    Mint a server-side run id of the form RUN-YYYYMMDD-HHMMSS-NNNN.
    NNNN is a per-day counter persisted at data/_run_seq/YYYYMMDD.txt under a
    threading lock. Called from create_session() so meta.run_id is set before
    the trigger endpoint returns to the client.
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
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        run_id = mint_run_id(now_dt)
        meta = {
            "session_id": session_id,
            "run_id": run_id,
            "trigger_mode": trigger_mode,
            "upload_id": upload_id,
            "status": "queued",
            "execution_status": None,
            "created_at": now,
            "completed_at": None,
            "event_count": 0,
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

    # ── SSE queue + event log (events.jsonl append-only) ─────────────────────

    def get_or_create_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._queues:
            self._queues[session_id] = asyncio.Queue()
        return self._queues[session_id]

    def _next_event_id(self, session_id: str) -> int:
        meta = self._sessions.get(session_id) or _read_json(_SESSIONS_DIR / f"{session_id}_meta.json") or {}
        n = int(meta.get("event_count", 0)) + 1
        meta["event_count"] = n
        self._sessions[session_id] = meta
        # Persist meta change inline so a crash mid-run preserves event_count
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)
        return n

    def _append_event_jsonl(self, session_id: str, event_with_id: dict) -> None:
        path = _SESSIONS_DIR / f"{session_id}_events.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event_with_id, ensure_ascii=False) + "\n")

    async def emit(self, session_id: str, event: dict) -> None:
        q = self.get_or_create_queue(session_id)
        # Heartbeats: live-only, never persisted, never id-stamped
        if event.get("type") == "heartbeat":
            await q.put(event)
            return
        eid = self._next_event_id(session_id)
        record = {"id": eid, "ts": _now_iso(), **event}
        self._append_event_jsonl(session_id, record)
        self._event_logs.setdefault(session_id, []).append(record)
        await q.put(record)

    def get_event_log(self, session_id: str, after_id: int = 0) -> list:
        """
        Return persisted events for a session, optionally filtered to id > after_id.
        Reads events.jsonl primarily; falls back to legacy events.json (whole-file JSON
        with {"events": [...]}) so older runs still display in RunsPage.
        """
        if session_id in self._event_logs and after_id == 0:
            return self._event_logs[session_id]

        events: list[dict] = []
        jsonl_path = _SESSIONS_DIR / f"{session_id}_events.jsonl"
        if jsonl_path.exists():
            with open(jsonl_path, "r", encoding="utf-8") as f:
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

        # Legacy fallback: events.json from before the jsonl conversion. These records
        # have no "id" field — we synthesise a position-based id so the SSE replay
        # protocol still works (Last-Event-ID will just deliver everything if absent).
        legacy = _read_json(_SESSIONS_DIR / f"{session_id}_events.json")
        if legacy:
            for i, rec in enumerate(legacy.get("events", []), start=1):
                if i > after_id:
                    events.append({"id": i, **rec})
        return events

    # ── Status state machine ─────────────────────────────────────────────────

    def set_status(self, session_id: str, status: str, **extra: Any) -> None:
        """
        Update meta.status (and optionally other fields) and persist atomically.
        Use the canonical status values:
          queued | running | awaiting_approval | complete | failed | interrupted | cancelled
        """
        meta = self._sessions.get(session_id) or _read_json(_SESSIONS_DIR / f"{session_id}_meta.json") or {}
        meta["status"] = status
        for k, v in extra.items():
            meta[k] = v
        self._sessions[session_id] = meta
        _write_json(_SESSIONS_DIR / f"{session_id}_meta.json", meta)

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

    # ── Runs page filters + detail ────────────────────────────────────────────

    def list_runs(
        self,
        *,
        status: list[str] | None = None,
        trigger_mode: list[str] | None = None,
        run_id_contains: str | None = None,
        started_after: str | None = None,
        started_before: str | None = None,
        has_systemic_stress: bool | None = None,
        sort: str = "created_at:desc",
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """
        Filter+sort+paginate persisted runs for the RunsPage.
        File-scan is fine up to a few thousand runs; revisit with an index file
        if list_sessions becomes slow.
        """
        sessions = self.list_sessions()
        out: list[dict] = []
        for s in sessions:
            if status and s.get("status") not in status:
                continue
            if trigger_mode and s.get("trigger_mode") not in trigger_mode:
                continue
            rid = s.get("run_id") or ""
            if run_id_contains and run_id_contains.lower() not in rid.lower():
                continue
            created = s.get("created_at") or ""
            if started_after and created < started_after:
                continue
            if started_before and created > started_before:
                continue
            if has_systemic_stress is True and not s.get("systemic_stress"):
                continue
            if has_systemic_stress is False and s.get("systemic_stress"):
                continue
            out.append(s)

        # sort
        sort_field, _, sort_dir = sort.partition(":")
        sort_dir = sort_dir or "desc"
        reverse = sort_dir == "desc"
        try:
            out.sort(key=lambda r: (r.get(sort_field) or ""), reverse=reverse)
        except TypeError:
            out.sort(key=lambda r: str(r.get(sort_field) or ""), reverse=reverse)

        total = len(out)
        page = out[offset: offset + limit]
        return {"total": total, "limit": limit, "offset": offset, "runs": page}

    def get_run_detail(self, session_id: str, events_limit: int = 200) -> dict | None:
        """Aggregate everything the RunDetailPage needs: meta + state + recent events."""
        meta = self.get_session(session_id)
        if meta is None:
            return None
        state = self.get_pipeline_state(session_id) or {}
        events = self.get_event_log(session_id)
        if events_limit and len(events) > events_limit:
            events = events[-events_limit:]
        return {
            "meta": meta,
            "state": state,
            "events": events,
            "event_count": meta.get("event_count", len(events)),
        }

    # ── Crash-recovery sweep (called from FastAPI startup hook) ──────────────

    def sweep_stranded_runs(self) -> int:
        """
        On process startup, mark any run whose status is non-terminal as 'interrupted'.
        Single-uvicorn-worker invariant: no other process owns these runs, so we can
        unilaterally claim and rewrite their meta files.
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
                meta["status"] = "interrupted"
                meta["execution_status"] = "INTERRUPTED"
                meta["completed_at"] = now
                _write_json(meta_path, meta)
                # Append a final marker event so RunDetailPage's timeline shows the death.
                eid = int(meta.get("event_count", 0)) + 1
                meta["event_count"] = eid
                _write_json(meta_path, meta)
                self._append_event_jsonl(meta["session_id"], {
                    "id": eid, "ts": now, "type": "run-interrupted",
                    "reason": "process_died_before_completion", "prior_status": current,
                })
                swept += 1
                logger.warning("[SERVICE] run_interrupted_on_startup  session_id=%s prior_status=%s",
                               meta.get("session_id"), current)
        if swept:
            logger.info("[SERVICE] sweep_stranded_runs  swept=%d", swept)
        return swept
