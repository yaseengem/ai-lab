"""Step 6: Settlement Roll Agent — delivers roll instructions to Strate via TIS."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import SETTLEMENT_ROLL_SYSTEM_PROMPT
from ..tools.strate_tools import get_strate_roll_eligibility, format_strate_roll_instruction
from ..tools.tis_tools import submit_roll_to_tis, get_roll_confirmation, notify_counterparty


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=SETTLEMENT_ROLL_SYSTEM_PROMPT,
        tools=[
            get_strate_roll_eligibility, format_strate_roll_instruction,
            submit_roll_to_tis, get_roll_confirmation, notify_counterparty,
        ],
    )


@tool
def settlement_roll_agent(roll_items: str) -> str:
    """
    Step 6 of the JSE settlement failure prevention pipeline.

    Formats and delivers settlement roll instructions to Strate via CIS/TIS for all
    SETTLEMENT_ROLL flagged items. Checks eligibility, formats per ISO 20022/Strate SWIFT,
    submits via TIS, confirms with Strate, and notifies counterparties within 15 minutes.

    Args:
        roll_items: JSON string array of intervention plan items with SETTLEMENT_ROLL type.

    Returns:
        JSON string with key "roll_execution_report" containing roll log and summary.
    """
    return str(_make_agent()(
        f"Execute settlement roll instructions for these items following Strate roll rules. "
        f"Items:\n{roll_items}\n\n"
        f"For each item: check eligibility, determine new_settlement_date (+1 business day), "
        f"map root_cause to reason_code, format instruction, submit to TIS, confirm, notify counterparty. "
        f"Escalate ineligible trades to HUMAN_ESCALATION. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'roll_execution_report' AND an 'agent_reasoning' array (3-5 strings) "
        f"explaining: eligibility outcomes, reason code mappings chosen and why, any escalations."
    ))
