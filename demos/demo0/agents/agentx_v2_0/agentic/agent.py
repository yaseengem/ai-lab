"""
Top-level Strands agent for the v2.0 template.

Provides:
  create_agent(persona, user_id, session_id, history) → configured Strands Agent
  run_chat(session_id, persona, user_id, message)      → async SSE generator

The agent is persona-aware and operations-aware: it carries read-only ops tools
(list_runs / get_run / list_cases / get_case / get_memory / get_config /
get_health / list_pending_approvals) so chat can answer questions about the
agent's own runs, cases, memory, configuration, health, and pending approvals.
"""

from __future__ import annotations

import json
import os
import sys
from collections.abc import AsyncGenerator
from pathlib import Path

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from strands import Agent  # noqa: E402

from commons.logger import get_logger  # noqa: E402
from .model import get_model  # noqa: E402
from .paths import SESSIONS_DIR as _HISTORY_DIR  # noqa: E402
from .prompts import SYSTEM_PROMPT, persona_instruction  # noqa: E402
from .tools.ops import (  # noqa: E402
    list_runs, get_run, list_cases, get_case, get_memory,
    get_config, get_health, list_pending_approvals,
)

logger = get_logger(__name__)

# Operations-awareness tools — read-only access to the agent's own state.
_ALL_TOOLS = [
    list_runs, get_run, list_cases, get_case, get_memory,
    get_config, get_health, list_pending_approvals,
]


# ── conversation history persistence ─────────────────────────────────────────

def _history_file(session_id: str, persona: str) -> Path:
    _HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    return _HISTORY_DIR / f"{session_id}_{persona}_history.json"


def _load_history(session_id: str, persona: str) -> list:
    f = _history_file(session_id, persona)
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def _save_history(session_id: str, persona: str, messages: list) -> None:
    f = _history_file(session_id, persona)
    tmp = str(f) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(messages, fh, indent=2)
    os.replace(tmp, str(f))


def _final_assistant_text(messages: list) -> str:
    """Extract plain text from the last assistant message (Anthropic converse format)."""
    for msg in reversed(messages):
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        content = msg.get("content", [])
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict) and block.get("type") == "text"
            )
    return ""


# ── agent factory ─────────────────────────────────────────────────────────────

def create_agent(
    persona: str = "end_user",
    user_id: str = "",
    session_id: str = "",
    history: list | None = None,
) -> Agent:
    """
    Create a persona-aware agent instance. A new instance is created per request;
    prior conversation history is restored via `history` so context is preserved.
    """
    logger.info("[AGENT] create_agent  persona=%s user_id=%s session_id=%s history_msgs=%d",
                persona, user_id, session_id, len(history or []))

    context_block = (
        f"\n\n=== CURRENT SESSION CONTEXT ===\n"
        f"Persona:    {persona}\n"
        f"User ID:    {user_id or 'unknown'}\n"
        f"Session ID: {session_id or 'unknown'}\n"
        f"=================================\n"
        f"{persona_instruction(persona)}\n"
    )
    system_prompt = SYSTEM_PROMPT + context_block

    agent = Agent(
        model=get_model(),
        system_prompt=system_prompt,
        tools=_ALL_TOOLS,
        messages=history or [],
    )
    logger.info("[AGENT] create_agent  ready  persona=%s tools=%d", persona, len(_ALL_TOOLS))
    return agent


# ── SSE chat stream ────────────────────────────────────────────────────────────

async def run_chat(
    session_id: str,
    persona: str,
    user_id: str,
    message: str,
) -> AsyncGenerator[str, None]:
    """
    Yield SSE-formatted strings for the FastAPI StreamingResponse.

    Event types emitted:
      {"type": "text-delta",  "content": "<token>"}
      {"type": "tool-status", "tool": "<name>", "status": "running"}
      {"type": "done"}
      {"type": "error",       "message": "<msg>"}
    """
    logger.info("[CHAT] run_chat  session_id=%s persona=%s user_id=%s msg_len=%d",
                session_id, persona, user_id, len(message))

    history = _load_history(session_id, persona)
    agent = create_agent(persona=persona, user_id=user_id, session_id=session_id, history=history)
    streamed_text = ""
    seen_tools: set[str] = set()

    try:
        async for event in agent.stream_async(message):
            if not isinstance(event, dict):
                continue

            text = event.get("data", "")
            if text:
                streamed_text += text
                yield f"data: {json.dumps({'type': 'text-delta', 'content': text})}\n\n"
                continue

            tool_use = event.get("current_tool_use")
            if tool_use and tool_use.get("name"):
                tool_name = tool_use["name"]
                if tool_name not in seen_tools:
                    seen_tools.add(tool_name)
                    logger.info("[CHAT] tool_invoked  session_id=%s tool=%s", session_id, tool_name)
                    yield f"data: {json.dumps({'type': 'tool-status', 'tool': tool_name, 'status': 'running'})}\n\n"

    except Exception as exc:
        logger.error("[CHAT] agent_error  session_id=%s error=%s", session_id, exc)
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    # Recover any post-tool-call continuation text not surfaced via the iterator.
    try:
        final_text = _final_assistant_text(agent.messages)
        if final_text and not final_text.startswith(streamed_text):
            remainder = final_text[len(streamed_text):]
            if remainder.strip():
                yield f"data: {json.dumps({'type': 'text-delta', 'content': remainder})}\n\n"
    except Exception as flush_exc:
        logger.warning("[CHAT] flush_error  session_id=%s error=%s", session_id, flush_exc)

    try:
        _save_history(session_id, persona, agent.messages)
        logger.info("[CHAT] history_saved  session_id=%s msgs=%d", session_id, len(agent.messages))
    except Exception as save_exc:
        logger.warning("[CHAT] history_save_failed  session_id=%s error=%s", session_id, save_exc)

    logger.info("[CHAT] stream_complete  session_id=%s", session_id)
    yield 'data: {"type": "done"}\n\n'
