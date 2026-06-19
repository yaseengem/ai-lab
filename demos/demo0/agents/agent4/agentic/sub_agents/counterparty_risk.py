"""Step 3: Counterparty Risk Agent — deep-dive on HIGH/CRITICAL counterparties."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import COUNTERPARTY_RISK_SYSTEM_PROMPT
from ..tools.cis_tools import get_cis_deep_profile, get_securities_lending_depth
from ..tools.jse_tools import check_jse_watchlist, get_historical_settlement_record


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=COUNTERPARTY_RISK_SYSTEM_PROMPT,
        tools=[
            get_cis_deep_profile, get_securities_lending_depth,
            check_jse_watchlist, get_historical_settlement_record,
        ],
    )


@tool
def counterparty_risk_agent(settlement_watchlist: str) -> str:
    """
    Step 3 of the JSE settlement failure prevention pipeline.

    Performs deep-dive analysis on all HIGH and CRITICAL counterparties.
    Cross-checks CIS profiles, securities lending depth, JSE watchlist entries,
    and 90-day settlement history to identify root causes. Sets systemic_risk_flag
    if more than 3 CRITICAL counterparties are identified simultaneously.

    Args:
        settlement_watchlist: JSON string output from risk_scoring_agent containing
                              the full watchlist (agent filters to HIGH/CRITICAL internally).

    Returns:
        JSON string with keys "counterparty_risk_assessment" (array) and "systemic_risk_flag" (bool).
    """
    return str(_make_agent()(
        f"Perform deep-dive risk analysis on all HIGH and CRITICAL counterparties in this watchlist. "
        f"Watchlist:\n{settlement_watchlist}\n\n"
        f"For each HIGH/CRITICAL counterparty: call get_cis_deep_profile, check_jse_watchlist, "
        f"get_historical_settlement_record (90 days), and get_securities_lending_depth if lending gap exists. "
        f"Identify root_cause_category, intervention_urgency, and recommended_intervention_type. "
        f"Set systemic_risk_flag=true if >3 CRITICAL counterparties. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'counterparty_risk_assessment', 'systemic_risk_flag', AND an "
        f"'agent_reasoning' array (3-6 strings) explaining: root cause determination per counterparty, "
        f"key signals from CIS/watchlist/history, systemic flag rationale."
    ))
