"""Step 1: Data Ingestion Agent — collects and normalises settlement exposure data."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import DATA_INGESTION_SYSTEM_PROMPT
from ..tools.ecs_tools import get_ecs_clearing_positions
from ..tools.cis_tools import get_cis_counterparty_data
from ..tools.tis_tools import get_tis_open_trades


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=DATA_INGESTION_SYSTEM_PROMPT,
        tools=[get_tis_open_trades, get_ecs_clearing_positions, get_cis_counterparty_data],
    )


@tool
def data_ingestion_agent(trigger_input: str) -> str:
    """
    Step 1 of the JSE settlement failure prevention pipeline.

    Collects clearing positions from ECS, counterparty health from CIS, and open
    trades from TIS for T+1 and T+2 settlement windows. Returns a normalised
    settlement_exposure_snapshot JSON with all trades, counterparty profiles,
    ECS positions, and data quality flags.

    Args:
        trigger_input: JSON string describing the trigger — either '{"mode": "api"}'
                       for mock data, or '{"mode": "upload", "data": {...}}' with
                       pre-parsed exposure data.

    Returns:
        JSON string with key "settlement_exposure_snapshot".
    """
    return str(_make_agent()(
        f"Collect all pre-settlement exposure data for T+1 and T+2 windows. "
        f"Trigger context: {trigger_input}. "
        f"Follow your instructions exactly: call get_tis_open_trades first, "
        f"then get_ecs_clearing_positions, then get_cis_counterparty_data. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include both 'settlement_exposure_snapshot' and an 'agent_reasoning' "
        f"array (3-6 strings) documenting what you found: data quality issues, CIS gaps, "
        f"counterparties with missing data, unusual exposure levels."
    ))
