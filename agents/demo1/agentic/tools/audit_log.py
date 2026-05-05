"""Audit logging tools — append-only per-case text file."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path

from strands import tool

_CLAIMS_BASE = Path(__file__).parent.parent.parent  # agents/demo1/
_LOGS_DIR = _CLAIMS_BASE / "data" / "logs" / "cases"


def _log_path(case_id: str) -> Path:
    _LOGS_DIR.mkdir(parents=True, exist_ok=True)
    return _LOGS_DIR / f"{case_id}.txt"


@tool
def log_decision(case_id: str, agent_name: str, decision: str, reasoning: str) -> str:
    """
    Append a structured audit log entry to the per-case audit file.
    MANDATORY: every sub-agent must call this after completing its work.

    Args:
        case_id:    The case identifier (e.g. CLM-20260414-0042).
        agent_name: Name of the agent writing the entry (e.g. INTAKE_AGENT).
        decision:   One-line summary of what was decided or done.
        reasoning:  Full explanation of why — include key facts, values, and checks performed.

    Returns:
        "ok" on success.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    entry = (
        f"\n[{ts}] [{agent_name.upper()}]\n"
        f"  Decision : {decision}\n"
        f"  Reasoning: {reasoning}\n"
    )
    log_file = _log_path(case_id)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(entry)
    return "ok"


@tool
def read_audit_log(case_id: str, role: str = "support_exec", user_id: str = "") -> str:
    """
    Read the full audit log for a specific case.
    Role-gated: end_user may only read their own cases (enforced by master).
    support_exec and admin can read any case.

    Args:
        case_id: The case identifier.
        role:    Caller role — end_user | support_exec | admin.
        user_id: Required when role=end_user for access verification.

    Returns:
        Full text of the audit log, or a message if not found.
    """
    log_file = _log_path(case_id)
    if not log_file.exists():
        return f"No audit log found for case {case_id}."
    return log_file.read_text(encoding="utf-8")
