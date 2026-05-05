"""Session memory tools — per-session key/value store backed by JSON files."""
from __future__ import annotations

import json
import os
from pathlib import Path

from strands import tool

_CLAIMS_BASE = Path(__file__).parent.parent.parent  # agents/demo1/
_SESSIONS_DIR = _CLAIMS_BASE / "data" / "sessions"


def _session_file(session_id: str) -> Path:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return _SESSIONS_DIR / f"{session_id}.json"


def _load(session_id: str) -> dict:
    f = _session_file(session_id)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save(session_id: str, data: dict) -> None:
    tmp = str(_session_file(session_id)) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, str(_session_file(session_id)))


@tool
def memory_save(session_id: str, key: str, value: str) -> str:
    """
    Save a fact to session memory. Use this to remember context across chat turns.
    Examples: current case_id, user identity, last intent, active policy_no.

    Args:
        session_id: The current chat session identifier.
        key:        Fact name (e.g. "current_case_id", "user_name", "policy_no").
        value:      Value to store (string).

    Returns:
        "ok"
    """
    data = _load(session_id)
    data[key] = value
    _save(session_id, data)
    return "ok"


@tool
def memory_load(session_id: str) -> str:
    """
    Load all remembered facts for this session.
    Call this at the start of each chat turn to restore context from prior turns.

    Args:
        session_id: The current chat session identifier.

    Returns:
        JSON string of {key: value} pairs, or "{}" if no memory exists.
    """
    data = _load(session_id)
    return json.dumps(data)
