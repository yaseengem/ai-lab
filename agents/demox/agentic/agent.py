"""
Top-level agent — build the Strands Agent and expose run_chat().

This is the main entry point called by service.py.
Add your tools and sub-agents here.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from strands import Agent

from commons.logger import get_logger
from .model import get_model

logger = get_logger(__name__)

# Build the agent once at import time.
# Add tools: Agent(model=..., tools=[my_tool, ...])
_agent = Agent(model=get_model())


async def run_chat(
    session_id: str,
    role: str,
    user_id: str,
    message: str,
) -> AsyncGenerator[str, None]:
    """Stream a chat response as SSE-formatted chunks."""
    logger.info("[AGENT] run_chat  session_id=%s role=%s", session_id, role)

    async for event in _agent.stream_async(message):
        if data := event.get("data", {}).get("text", ""):
            yield f'data: {{"type":"text-delta","content":{data!r}}}\n\n'

    yield 'data: {"type":"done"}\n\n'
