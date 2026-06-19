"""Step 2: Risk Scoring Agent — classifies each trade/counterparty as CRITICAL/HIGH/MEDIUM/LOW."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import RISK_SCORING_SYSTEM_PROMPT
from ..tools.ecs_tools import get_market_volatility_context
from ..tools.cis_tools import get_historical_failure_rates


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=RISK_SCORING_SYSTEM_PROMPT,
        tools=[get_market_volatility_context, get_historical_failure_rates],
    )


@tool
def risk_scoring_agent(settlement_exposure_snapshot: str) -> str:
    """
    Step 2 of the JSE settlement failure prevention pipeline.

    Scores each trade/counterparty pair for settlement failure risk using
    deterministic rule engine + LLM reasoning. Classifies as CRITICAL, HIGH,
    MEDIUM, or LOW. Returns a risk-ranked settlement_watchlist JSON.

    Args:
        settlement_exposure_snapshot: JSON string output from data_ingestion_agent
                                      containing t1_trades, t2_trades, counterparty_profiles,
                                      and ecs_positions.

    Returns:
        JSON string with key "settlement_watchlist" — array sorted CRITICAL first.
    """
    return str(_make_agent()(
        f"Score all trades for settlement failure risk using the rules in your system prompt. "
        f"Input exposure snapshot:\n{settlement_exposure_snapshot}\n\n"
        f"Apply deterministic rules first, then escalation overrides, then LLM adjudication. "
        f"Call get_market_volatility_context and get_historical_failure_rates for all counterparties. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'settlement_watchlist' sorted CRITICAL first AND an 'agent_reasoning' "
        f"array (4-8 strings) explaining: which escalation overrides fired and for which counterparties, "
        f"how market context influenced scores, any borderline cases and how you resolved them."
    ))
