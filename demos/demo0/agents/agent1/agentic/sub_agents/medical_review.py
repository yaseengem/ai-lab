"""Medical review sub-agent — health claims only, cross-checks physician vs bills."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import MEDICAL_REVIEW_SYSTEM_PROMPT
from ..tools.document import extract_pdf
from ..tools.csv_store import update_case_csv
from ..tools.audit_log import log_decision


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=MEDICAL_REVIEW_SYSTEM_PROMPT,
        tools=[extract_pdf, update_case_csv, log_decision],
    )


@tool
def medical_review_agent(medical_review_input: str) -> str:
    """
    Call this for health claims ONLY, after validation PASS, when both a
    physician_report AND medical_bill are in documents_submitted.
    Do NOT call for auto, property, or liability claims.
    Do NOT call if physician_report or medical_bill is missing.
    Extracts diagnosis from physician report, extracts itemised billing from
    medical bills, and cross-checks: are all billed procedures consistent with
    the diagnosis? Flags discrepant line items and sets recommended_coverage_amount
    to only the justified items.
    Input should include: case_id, physician_report file path, medical_bill file path.
    Returns: medical_review_status, billed_amount, recommended_coverage_amount, discrepancy_details.
    """
    return str(_make_agent()(medical_review_input))
