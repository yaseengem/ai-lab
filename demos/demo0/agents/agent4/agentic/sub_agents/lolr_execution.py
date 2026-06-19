"""Step 5: LOLR Execution Agent — executes Lender-of-Last-Resort transactions."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import LOLR_EXECUTION_SYSTEM_PROMPT
from ..tools.audit_tools import (
    construct_lolr_transaction, validate_lolr_transaction,
    submit_lolr_transaction, get_lolr_execution_status,
)


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=LOLR_EXECUTION_SYSTEM_PROMPT,
        tools=[
            construct_lolr_transaction, validate_lolr_transaction,
            submit_lolr_transaction, get_lolr_execution_status,
        ],
    )


@tool
def lolr_execution_agent(lolr_items: str) -> str:
    """
    Step 5 of the JSE settlement failure prevention pipeline.

    Executes LOLR transactions for items with intervention_type=LOLR_TRIGGER and
    requires_human_approval=false. Constructs, validates, submits, and confirms each
    transaction. Enforces ZAR 500M total guard limit. Includes regulatory_basis on
    every transaction per JSE CCP Rulebook Section 14.3.

    Args:
        lolr_items: JSON string array of intervention plan items with LOLR_TRIGGER type
                    and requires_human_approval=false, optionally pre-approved by human gate.

    Returns:
        JSON string with key "lolr_execution_report" containing execution log and summary.
    """
    return str(_make_agent()(
        f"Execute LOLR transactions for these approved items. Do not exceed ZAR 500M total. "
        f"Items to execute:\n{lolr_items}\n\n"
        f"For each item: construct_lolr_transaction, validate_lolr_transaction, submit_lolr_transaction, "
        f"then get_lolr_execution_status. Track running total value. "
        f"Every transaction must include regulatory_basis = 'JSE CCP Rulebook Section 14.3'. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'lolr_execution_report' AND an 'agent_reasoning' array (3-5 strings) "
        f"explaining: validation outcomes, any failures and retry decisions, guard limit application."
    ))
