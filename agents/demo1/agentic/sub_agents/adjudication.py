"""Adjudication sub-agent — settlement calculation and decision rendering."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import ADJUDICATION_SYSTEM_PROMPT
from ..tools.csv_store import query_claims_metadata, query_policies, update_case_csv
from ..tools.audit_log import log_decision
from ..tools.utils import current_time


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=ADJUDICATION_SYSTEM_PROMPT,
        tools=[
            query_claims_metadata, query_policies,
            update_case_csv, log_decision, current_time,
        ],
    )


@tool
def adjudication_agent(adjudication_input: str) -> str:
    """
    Call this after fraud_agent completes. Reads the full case context, retrieves
    coverage limits and deductible, calculates the eligible settlement amount, and
    renders a decision: approved | partial | denied | escalate.
    Uses recommended_coverage_amount (not billed_amount) for health claims with discrepancies.
    Auto-escalates if: fraud_score=high, claim > 80% of coverage limit, or medical discrepancy.
    Does NOT set pending_approval status — that is done by decision_qa_agent.
    Input should include: case_id.
    Returns: adjudication_decision, settlement_amount, decision_reason.
    """
    return str(_make_agent()(adjudication_input))
