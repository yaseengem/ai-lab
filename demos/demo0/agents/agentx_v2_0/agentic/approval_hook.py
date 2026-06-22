"""
Human-in-the-loop (HITL) approval hook for the v2.0 template agent.

A simple asyncio.Event / asyncio.Future based pause/resume primitive the run
engine can await on. When the pipeline reaches an approval gate it creates a
pending approval and awaits its future; an /approve or /reject route resolves it.

IMPORTANT (single-worker invariant): the awaiting task and the resolving route
handler must live in the same process. The agent runs with a single uvicorn
worker — do NOT add `--workers N` without replacing this in-memory mechanism
(e.g. file + watcher, or Redis pub/sub).
"""

from __future__ import annotations

import asyncio

from commons.logger import get_logger

logger = get_logger(__name__)

# Canonical decisions the gate resolves to.
APPROVE = "approve"
REJECT = "reject"


class ApprovalHook:
    """In-process registry of pending HITL approvals keyed by (session_id, item_id)."""

    def __init__(self) -> None:
        self._futures: dict[str, dict[str, asyncio.Future]] = {}

    def create_gate(self, session_id: str, item_id: str) -> asyncio.Future:
        """Register a pending approval and return the future the run awaits on."""
        loop = asyncio.get_event_loop()
        future: asyncio.Future = loop.create_future()
        self._futures.setdefault(session_id, {})[item_id] = future
        logger.info("[HITL] gate_open  session_id=%s item_id=%s", session_id, item_id)
        return future

    async def wait(self, session_id: str, item_id: str, timeout: float | None = None) -> str:
        """
        Await the decision for a gate. Returns 'approve' or 'reject'.
        On timeout, resolves to 'reject' (fail-safe) and emits a log warning.
        """
        future = self._futures.get(session_id, {}).get(item_id)
        if future is None:
            future = self.create_gate(session_id, item_id)
        try:
            decision = await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("[HITL] gate_timeout  session_id=%s item_id=%s", session_id, item_id)
            decision = REJECT
        finally:
            self._futures.get(session_id, {}).pop(item_id, None)
        return decision

    def resolve(self, session_id: str, item_id: str, decision: str) -> bool:
        """
        Resolve an open gate. Returns True if a pending future was found and set.
        `decision` is normalised to APPROVE/REJECT.
        """
        normalised = APPROVE if str(decision).lower().startswith("appro") else REJECT
        future = self._futures.get(session_id, {}).get(item_id)
        if future and not future.done():
            future.set_result(normalised)
            logger.info("[HITL] gate_resolved  session_id=%s item_id=%s decision=%s",
                        session_id, item_id, normalised)
            return True
        logger.warning("[HITL] gate_not_found  session_id=%s item_id=%s", session_id, item_id)
        return False

    def pending(self, session_id: str) -> list[str]:
        """Return the item_ids with open gates for a session."""
        return [iid for iid, fut in self._futures.get(session_id, {}).items() if not fut.done()]
