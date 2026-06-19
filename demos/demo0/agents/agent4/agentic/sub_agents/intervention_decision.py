"""Step 4: Intervention Decision Agent — determines optimal intervention per item."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import INTERVENTION_DECISION_SYSTEM_PROMPT
from ..tools.jse_tools import get_jse_rulebook_guidance, calculate_intervention_cost, check_lolr_capacity


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=INTERVENTION_DECISION_SYSTEM_PROMPT,
        tools=[get_jse_rulebook_guidance, calculate_intervention_cost, check_lolr_capacity],
    )


@tool
def intervention_decision_agent(risk_context: str) -> str:
    """
    Step 4 of the JSE settlement failure prevention pipeline.

    Determines the optimal intervention for each at-risk settlement: MONITOR_ONLY,
    ALERT_OPERATIONS, SETTLEMENT_ROLL, LOLR_TRIGGER, or HUMAN_ESCALATION. Applies
    JSE rulebook decision rules, checks LOLR capacity, and calculates intervention costs.

    Args:
        risk_context: JSON string containing both "settlement_watchlist" and
                      "counterparty_risk_assessment" from Steps 2 and 3.

    Returns:
        JSON string with key "intervention_plan" containing items[] and plan_summary.
        Each item includes requires_human_approval (bool) and intervention_type.
    """
    return str(_make_agent()(
        f"Determine the optimal intervention for each HIGH/CRITICAL item using the JSE decision rules. "
        f"Risk context:\n{risk_context}\n\n"
        f"For each item: consult get_jse_rulebook_guidance, check LOLR capacity for LOLR candidates, "
        f"calculate intervention cost. Apply decision rules strictly — REGULATORY_FLAG items always "
        f"get HUMAN_ESCALATION. Set requires_human_approval=true for items needing human gate. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'intervention_plan' (items[] and plan_summary) AND an 'agent_reasoning' "
        f"array (4-8 strings) explaining: which decision rule branch applied per item, LOLR capacity "
        f"outcomes, why specific items required human approval vs automated action."
    ))
