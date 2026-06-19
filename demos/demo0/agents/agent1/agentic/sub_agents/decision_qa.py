"""Decision QA sub-agent — self-correction loop, always runs after adjudication."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import DECISION_QA_SYSTEM_PROMPT
from ..tools.csv_store import query_claims_metadata, update_case_csv
from ..tools.audit_log import read_audit_log, log_decision
from ..tools.utils import current_time


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=DECISION_QA_SYSTEM_PROMPT,
        tools=[
            query_claims_metadata, read_audit_log,
            update_case_csv, log_decision, current_time,
        ],
    )


@tool
def decision_qa_agent(qa_input: str) -> str:
    """
    ALWAYS call this after adjudication_agent. Never skip.
    Validates consistency across all pipeline stages: checks fraud/decision alignment,
    validation/decision alignment, medical review arithmetic, and audit log completeness.
    Verdicts:
      PASS         — all checks consistent → sets status=pending_approval
      FIX_REQUIRED — specific issue found → returns which agent to re-run and why.
                     Master re-invokes that agent, then calls decision_qa_agent again (max 2 attempts).
      ESCALATE     — unresolvable issue or second FIX_REQUIRED → sets status=escalated_to_human
    Input should include: case_id and qa_attempt number (1 or 2).
    Returns: verdict (PASS|FIX_REQUIRED|ESCALATE), detailed findings, and fix instructions if applicable.
    """
    return str(_make_agent()(qa_input))
