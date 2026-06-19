"""
Session memory manager for Calvin.

Provides a simple per-session key/value store backed by JSON files in
data/sessions/. Used by the memory_save and memory_load tools to maintain
context across chat turns (current case_id, user identity, active policy, etc).
"""
from __future__ import annotations

import json
import os
from pathlib import Path

_CLAIMS_BASE = Path(__file__).parent.parent  # agents/agent1/
_SESSIONS_DIR = _CLAIMS_BASE / "data" / "sessions"


def _session_file(session_id: str) -> Path:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    return _SESSIONS_DIR / f"{session_id}.json"


def load_session(session_id: str) -> dict:
    """Load all session memory for *session_id*. Returns {} if not found."""
    f = _session_file(session_id)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_session(session_id: str, key: str, value: str) -> None:
    """Save a single key/value pair to session memory."""
    data = load_session(session_id)
    data[key] = value
    tmp = str(_session_file(session_id)) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, str(_session_file(session_id)))


def delete_session(session_id: str) -> None:
    """Remove session memory file if it exists."""
    f = _session_file(session_id)
    if f.exists():
        f.unlink()
