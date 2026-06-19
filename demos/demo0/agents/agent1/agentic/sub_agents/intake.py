"""Intake sub-agent — FNOL, policy verification, case record creation."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import INTAKE_SYSTEM_PROMPT
from ..tools.csv_store import generate_case_id, create_case_record, query_policies, update_case_csv
from ..tools.audit_log import log_decision
from ..tools.memory import memory_save, memory_load
from ..tools.utils import current_time


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=INTAKE_SYSTEM_PROMPT,
        tools=[
            generate_case_id, create_case_record, query_policies,
            update_case_csv, log_decision, memory_save, memory_load, current_time,
        ],
    )


@tool
def intake_agent(claim_input: str) -> str:
    """
    Conversational intake specialist. Call this immediately when the user expresses any
    intent to raise a claim, and on every subsequent turn while intake is in progress.

    claim_input MUST be formatted as:
        "[session_id: <session_id>]\\n<user message>"

    The agent uses the session_id to load/save memory across turns so it knows
    what has already been collected and what to ask for next.

    Returns the next customer-facing message. When all required fields are collected
    and the case record is created, the response ends with [INTAKE_COMPLETE] on its own line.
    """
    return str(_make_agent()(claim_input))
