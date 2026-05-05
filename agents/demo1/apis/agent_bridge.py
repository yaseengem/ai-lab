"""
Thin bridge that spawns the agentic workflow as an asyncio.Task.
Kept separate to avoid circular imports between service.py and agent.py.
"""
from __future__ import annotations

import asyncio

from commons.logger import get_logger

logger = get_logger(__name__)


def spawn_workflow(session_id: str, case_id: str, payload: dict) -> None:
    """Schedule run_processing_workflow as a background asyncio.Task."""
    from agents.demo1.agentic.agent import run_processing_workflow  # noqa: PLC0415

    logger.info("[BRIDGE] spawn_workflow  session_id=%s case_id=%s payload_keys=%s",
                session_id, case_id, list(payload.keys()) if payload else [])
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            run_processing_workflow(session_id, case_id, payload),
            name=f"workflow-{session_id}",
        )
        logger.info("[BRIDGE] spawn_workflow  task_created  session_id=%s", session_id)
    except RuntimeError:
        # No running loop (e.g. during tests) — log and skip
        logger.warning("[BRIDGE] spawn_workflow  no_running_event_loop  session_id=%s  workflow_not_spawned",
                       session_id)
