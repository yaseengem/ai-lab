"""Communication sub-agent — sends claimant notification after human approval."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import COMMUNICATION_SYSTEM_PROMPT
from ..tools.communication import send_email
from ..tools.csv_store import query_claims_metadata, query_policies, update_case_csv
from ..tools.audit_log import log_decision
from ..tools.utils import current_time


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=COMMUNICATION_SYSTEM_PROMPT,
        tools=[
            send_email, query_claims_metadata, query_policies,
            update_case_csv, log_decision, current_time,
        ],
    )


@tool
def communication_agent(communication_input: str) -> str:
    """
    Call this ONLY after approve_case has been called with decision=approved or overridden.
    Do NOT call this before human approval, and do NOT call if the case was rejected.
    Looks up the claimant's email from the policy record, drafts an appropriate
    notification email based on the final decision, and writes it to
    data/emails/{case_id}_email.md (demo mode — no real SMTP).
    The email file path is stored in the case metadata under email_file_path.
    Input should include: case_id.
    Returns: confirmation that email was written, file path, recipient address.
    """
    return str(_make_agent()(communication_input))
