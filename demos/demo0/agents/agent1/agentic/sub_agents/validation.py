"""Policy validation sub-agent — the early-exit gate."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import VALIDATION_SYSTEM_PROMPT
from ..tools.csv_store import query_policies, query_claims_history, update_case_csv
from ..tools.audit_log import log_decision
from ..tools.utils import current_time


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=VALIDATION_SYSTEM_PROMPT,
        tools=[
            query_policies, query_claims_history,
            update_case_csv, log_decision, current_time,
        ],
    )


@tool
def validation_agent(validation_input: str) -> str:
    """
    Call this after extraction (or directly after intake if no documents).
    This is the EARLY EXIT GATE. Checks: policy active status, coverage dates,
    claim type coverage, and exclusions.
    If validation FAILS (lapsed policy, excluded type, outside dates), processing
    stops here and the claim is routed directly to denied adjudication — medical
    review and fraud check are skipped entirely.
    Input should include: case_id, policy_no, incident_date, claim_type.
    Returns: validation_status (PASS or FAIL), reason, coverage_limit, deductible.
    """
    return str(_make_agent()(validation_input))
