"""Fraud detection sub-agent — runs before adjudication on every claim."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import FRAUD_SYSTEM_PROMPT
from ..tools.csv_store import query_fraud_patterns, query_claims_history, query_claims_metadata, update_case_csv
from ..tools.audit_log import log_decision


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=FRAUD_SYSTEM_PROMPT,
        tools=[
            query_fraud_patterns, query_claims_history,
            query_claims_metadata, update_case_csv, log_decision,
        ],
    )


@tool
def fraud_agent(fraud_input: str) -> str:
    """
    Call this after validation (and medical review if applicable), always before adjudication.
    Checks fraud pattern records, claim frequency in the past 90 days, and claim amount
    vs historical average. Assigns a fraud risk score (low | medium | high) and a
    recommendation (proceed | flag-for-review | deny).
    A high fraud score will cause adjudication to escalate the case to human review.
    Input should include: case_id, policy_no, user_id, claim_type, claimed_amount.
    Returns: fraud_score, fraud_recommendation, fraud_flags summary.
    """
    return str(_make_agent()(fraud_input))
