"""Utility tools shared across all agents."""
from __future__ import annotations

from datetime import datetime, timezone

from strands import tool


@tool
def current_time() -> str:
    """
    Return the current UTC date and time as an ISO-8601 string.
    Use this whenever you need a timestamp for audit log entries or case records.
    """
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
