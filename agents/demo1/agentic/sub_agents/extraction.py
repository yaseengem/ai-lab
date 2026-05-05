"""Document extraction sub-agent — PDF and .txt file processing."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import EXTRACTION_SYSTEM_PROMPT
from ..tools.document import extract_pdf, extract_text_file, classify_document
from ..tools.csv_store import update_case_csv
from ..tools.audit_log import log_decision


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=EXTRACTION_SYSTEM_PROMPT,
        tools=[
            extract_pdf, extract_text_file, classify_document,
            update_case_csv, log_decision,
        ],
    )


@tool
def extraction_agent(extraction_input: str) -> str:
    """
    Call this when PDF or .txt documents are submitted with a claim.
    Extracts text from each document, classifies its type (physician_report,
    medical_bill, police_report, repair_estimate, invoice, other), and pulls
    key fields for downstream agents.
    Input should include: case_id and a list of document file paths or filenames.
    For .pdf files uses extract_pdf; for .txt files uses extract_text_file.
    Returns: summary of all documents processed with types and extracted key fields.
    Do NOT call this if no documents were submitted.
    """
    return str(_make_agent()(extraction_input))
