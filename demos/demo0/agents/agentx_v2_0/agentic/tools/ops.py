"""
Operations-awareness tools for the v2.0 template chat agent.

These @tool functions give the chat agent READ access to its own operational
state on disk, so it can answer questions like "list recent runs", "what rules
are active?", "which model is this agent using?", "is the agent healthy?".

All paths are agent-relative. Reads are tolerant of missing/partial files —
they return a structured "empty" result rather than raising, so the chat agent
degrades gracefully.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from strands import tool

# agents/agentx_v2_0/agentic/tools/ops.py → agents/agentx_v2_0/
_AGENT_DIR = Path(__file__).parent.parent.parent
_SESSIONS_DIR = _AGENT_DIR / "data" / "sessions"
_MEMORY_FILE = _AGENT_DIR / "data" / "memory" / "agent_memory.json"
_CONFIG_FILE = _AGENT_DIR / "agent.config.yaml"


# ── low-level readers (shared with service self-check) ────────────────────────

def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _load_config() -> dict:
    try:
        return yaml.safe_load(_CONFIG_FILE.read_text(encoding="utf-8")) or {}
    except (FileNotFoundError, yaml.YAMLError):
        return {}


def _read_events(session_id: str, limit: int = 50) -> list[dict]:
    path = _SESSIONS_DIR / f"{session_id}.events.jsonl"
    if not path.exists():
        return []
    events: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events[-limit:] if limit else events


def _list_meta() -> list[dict]:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    metas = []
    for f in sorted(_SESSIONS_DIR.glob("*_meta.json"),
                    key=lambda p: p.stat().st_mtime, reverse=True):
        data = _read_json(f)
        if data:
            metas.append(data)
    return metas


# ── @tool functions ──────────────────────────────────────────────────────────

@tool
def list_runs(limit: int = 20) -> str:
    """
    List recent processing runs (most recent first) with their status.

    Args:
        limit: Maximum number of runs to return (default 20).

    Returns:
        JSON string: {"count": N, "runs": [{run_id, session_id, status, created_at, completed_at}, ...]}
    """
    metas = _list_meta()[: max(1, limit)]
    runs = [
        {
            "run_id": m.get("run_id"),
            "session_id": m.get("session_id"),
            "status": m.get("status"),
            "persona": m.get("persona"),
            "trigger_mode": m.get("trigger_mode"),
            "created_at": m.get("created_at"),
            "completed_at": m.get("completed_at"),
            "event_count": m.get("event_count", 0),
        }
        for m in metas
    ]
    return json.dumps({"count": len(runs), "runs": runs})


@tool
def get_run(run_id: str) -> str:
    """
    Get details and recent events for a single run, looked up by run_id or session_id.

    Args:
        run_id: The RUN-… id (or a session id) to look up.

    Returns:
        JSON string with {meta, events} for the run, or {"error": "..."} if not found.
    """
    metas = _list_meta()
    match = next(
        (m for m in metas if m.get("run_id") == run_id or m.get("session_id") == run_id),
        None,
    )
    if match is None:
        return json.dumps({"error": f"No run found for '{run_id}'"})
    events = _read_events(match.get("session_id", ""))
    return json.dumps({"meta": match, "events": events})


@tool
def get_memory() -> str:
    """
    Return everything the agent has stored in its memory (rules / preferences / LTM).

    Returns:
        JSON string of the full memory store, or "{}" if empty.
    """
    data = _read_json(_MEMORY_FILE) or {}
    return json.dumps({"memory": data})


@tool
def get_config() -> str:
    """
    Return the agent's runtime configuration (personas, features, defaults, capabilities).

    Use this to answer questions like "which model is this agent using?" or
    "is human-in-the-loop approval enabled?".

    Returns:
        JSON string of the parsed agent.config.yaml.
    """
    return json.dumps(_load_config())


@tool
def get_health() -> str:
    """
    Return the agent's startup self-check / readiness summary.

    Returns:
        JSON string: {"status": "ok"|"degraded", "checks": [{name, ok, detail}, ...]}.
    """
    # Import lazily to avoid a circular import (service imports tools indirectly).
    from agents.agentx_v2_0.apis.service import Service

    return json.dumps(Service.self_check())
