"""Mock ECS (Equities Clearing System) API tools."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from strands import tool

from .mock_data import get_counterparty_profiles, get_market_context, get_trades


@tool
def get_ecs_clearing_positions(date_range: str, counterparty_filter: str = "") -> str:
    """
    Returns net clearing positions, obligations, and exposure values per counterparty from ECS.

    Args:
        date_range: JSON with 't1_date' and 't2_date' fields (ISO date strings).
        counterparty_filter: Optional JSON array of counterparty IDs to filter. Empty = all.

    Returns:
        JSON array of clearing position objects per counterparty.
    """
    try:
        dr = json.loads(date_range) if date_range.strip().startswith("{") else {}
    except Exception:
        dr = {}

    try:
        cp_filter = json.loads(counterparty_filter) if counterparty_filter.strip() else []
    except Exception:
        cp_filter = []

    trades = get_trades()
    profiles = get_counterparty_profiles()
    positions: dict[str, dict] = {}

    for trade in trades:
        cp_id = trade["counterparty_id"]
        if cp_filter and cp_id not in cp_filter:
            continue
        cp = profiles.get(cp_id, {})
        if cp_id not in positions:
            positions[cp_id] = {
                "counterparty_id": cp_id,
                "counterparty_name": cp.get("name", "Unknown"),
                "net_obligation_zar": 0,
                "t1_exposure_zar": 0,
                "t2_exposure_zar": 0,
                "trades": [],
                "large_exposure_flag": False,
                "data_freshness_timestamp": datetime.now(timezone.utc).isoformat(),
            }
        positions[cp_id]["net_obligation_zar"] += trade["value_zar"]
        if trade["settlement_window"] == "T+1":
            positions[cp_id]["t1_exposure_zar"] += trade["value_zar"]
        else:
            positions[cp_id]["t2_exposure_zar"] += trade["value_zar"]
        positions[cp_id]["trades"].append(trade["trade_id"])

    result = list(positions.values())
    for pos in result:
        if pos["net_obligation_zar"] > 50_000_000:
            pos["large_exposure_flag"] = True

    return json.dumps(result, indent=2)


@tool
def get_market_volatility_context() -> str:
    """
    Returns current JSE market volatility index and recent price movements for relevant securities.

    Returns:
        JSON object with SAVI, ALSI move, per-security moves, repo rate, and stress flags.
    """
    return json.dumps(get_market_context(), indent=2)
