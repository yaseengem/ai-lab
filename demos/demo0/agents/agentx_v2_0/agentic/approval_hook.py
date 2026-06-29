"""
Human-in-the-loop (HITL) approval hook for the v2.0 template agent.

Durable pause/resume: the gate's state is the source of truth on disk at
state/runs/{session_id}.json, so a run paused for approval SURVIVES A RESTART.
An in-process asyncio.Event is layered on top purely to wake the awaiting task
promptly within a live process.

  • open  → run is paused, waiting for a human decision
  • approved / rejected → decision recorded; the awaiting task resumes

On restart the run engine re-arms a waiter for any gate still `open` (and resumes
immediately if it was resolved while the process was down — e.g. crash after
/approve but before finalize).

IMPORTANT (single-worker invariant): the awaiting task and the resolving /approve
route handler run in the same uvicorn worker. The disk gate makes state durable
across restarts; the in-memory Event still assumes one process. Do NOT add
`--workers N` without a cross-process wake mechanism (e.g. a filesystem watcher).
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone

from commons.logger import get_logger

from .paths import RUNS_DIR

logger = get_logger(__name__)

# Canonical decisions the gate resolves to.
APPROVE = "approve"
REJECT = "reject"

_OPEN = "open"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ApprovalHook:
    """Durable, file-backed registry of HITL approval gates keyed by session_id."""

    def __init__(self) -> None:
        # In-process wake events, keyed by session_id. Rebuilt freely after restart.
        self._events: dict[str, asyncio.Event] = {}

    # ── gate state on disk ────────────────────────────────────────────────────

    @staticmethod
    def _gate_path(session_id: str):
        return RUNS_DIR / f"{session_id}.json"

    def _read_gate(self, session_id: str) -> dict | None:
        try:
            return json.loads(self._gate_path(session_id).read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def _write_gate(self, session_id: str, gate: dict) -> None:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        path = self._gate_path(session_id)
        tmp = str(path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(gate, f, indent=2, ensure_ascii=False)
        os.replace(tmp, str(path))

    # ── public API ────────────────────────────────────────────────────────────

    def open_gate(self, session_id: str, item_id: str) -> None:
        """Record a pending approval on disk (idempotent — keeps an existing gate)."""
        if self._read_gate(session_id) is None:
            self._write_gate(session_id, {
                "session_id": session_id, "item_id": item_id,
                "status": _OPEN, "decision": None,
                "opened_at": _now_iso(), "resolved_at": None,
            })
        self._events.setdefault(session_id, asyncio.Event())
        logger.info("[HITL] gate_open  session_id=%s item_id=%s", session_id, item_id)

    async def wait(self, session_id: str, item_id: str, timeout: float | None = None) -> str:
        """
        Await the decision for a session's gate. Returns 'approve' or 'reject'.
        Resolves immediately if the gate was already decided (e.g. before a restart).
        On timeout, persists 'reject' (fail-safe).
        """
        self.open_gate(session_id, item_id)

        gate = self._read_gate(session_id) or {}
        if gate.get("status") in (APPROVE, REJECT):
            return gate["status"]

        event = self._events.setdefault(session_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("[HITL] gate_timeout  session_id=%s item_id=%s", session_id, item_id)
            self.resolve(session_id, item_id, REJECT)
        finally:
            self._events.pop(session_id, None)

        gate = self._read_gate(session_id) or {}
        return gate.get("decision") or REJECT

    def resolve(self, session_id: str, item_id: str, decision: str) -> bool:
        """
        Resolve an open gate. Returns True if a gate was open and is now decided.
        `decision` is normalised to APPROVE/REJECT and persisted before waking.
        """
        normalised = APPROVE if str(decision).lower().startswith("appro") else REJECT
        gate = self._read_gate(session_id)
        if not gate or gate.get("status") != _OPEN:
            logger.warning("[HITL] gate_not_open  session_id=%s item_id=%s", session_id, item_id)
            return False
        gate.update(status=normalised, decision=normalised, resolved_at=_now_iso())
        self._write_gate(session_id, gate)
        event = self._events.get(session_id)
        if event is not None:
            event.set()
        logger.info("[HITL] gate_resolved  session_id=%s item_id=%s decision=%s",
                    session_id, item_id, normalised)
        return True

    def is_open(self, session_id: str) -> bool:
        gate = self._read_gate(session_id)
        return bool(gate and gate.get("status") == _OPEN)

    def pending(self, session_id: str) -> list[str]:
        gate = self._read_gate(session_id)
        return [gate["item_id"]] if gate and gate.get("status") == _OPEN else []
