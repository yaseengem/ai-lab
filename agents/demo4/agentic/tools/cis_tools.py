"""Mock CIS (Counterparty Integration System) API tools."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from strands import tool

from .mock_data import get_counterparty_profiles, get_historical_failures, get_lending_depth


@tool
def get_cis_counterparty_data(counterparty_ids: str) -> str:
    """
    Returns counterparty health scores, integration status, securities lending balances,
    and margin levels from CIS.

    Args:
        counterparty_ids: JSON array of counterparty ID strings (e.g. '["CP-001", "CP-002"]').

    Returns:
        JSON array of counterparty profile objects. CIS_UNAVAILABLE counterparties are
        included with status field set to 'CIS_UNAVAILABLE'.
    """
    profiles = get_counterparty_profiles()
    try:
        ids = json.loads(counterparty_ids)
    except Exception:
        ids = list(profiles.keys())

    result = []
    for cp_id in ids:
        cp = profiles.get(cp_id)
        if not cp:
            continue
        profile = {
            "counterparty_id": cp_id,
            "name": cp["name"],
            "cis_status": cp["cis_status"],
            "lending_balance_pct": cp.get("lending_balance_pct"),
            "integration_health": cp.get("integration_health", "UNKNOWN"),
            "account_flags": cp.get("account_flags", []),
            "data_freshness_timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if cp["cis_status"] == "CIS_UNAVAILABLE":
            profile["note"] = "CIS integration timeout — counterparty data unavailable"
        result.append(profile)

    return json.dumps(result, indent=2)


@tool
def get_cis_deep_profile(counterparty_id: str) -> str:
    """
    Returns full counterparty profile including credit rating, margin call history (90 days),
    securities lending account details, integration health timeline, and account flags.

    Args:
        counterparty_id: Single counterparty ID string (e.g. 'CP-001').

    Returns:
        JSON object with full CIS deep profile.
    """
    cp = get_counterparty_profiles().get(counterparty_id)
    if not cp:
        return json.dumps({"error": f"Counterparty {counterparty_id} not found"})

    if cp["cis_status"] == "CIS_UNAVAILABLE":
        return json.dumps({
            "counterparty_id": counterparty_id,
            "cis_status": "CIS_UNAVAILABLE",
            "error": "CIS integration timeout — deep profile unavailable",
            "integration_health_timeline": [
                {"timestamp": "2026-05-06T06:00:00Z", "status": "UNAVAILABLE", "error": "TCP timeout"}
            ],
        })

    return json.dumps({
        "counterparty_id": counterparty_id,
        "name": cp["name"],
        "cis_status": cp["cis_status"],
        "credit_rating": cp.get("credit_rating", "UNKNOWN"),
        "margin_call_history_90d": cp.get("margin_call_history_90d", 0),
        "lending_balance_pct": cp.get("lending_balance_pct"),
        "integration_health": cp.get("integration_health"),
        "account_flags": cp.get("account_flags", []),
        "integration_health_timeline": [
            {"timestamp": "2026-05-06T06:00:00Z", "status": cp.get("integration_health", "HEALTHY")},
            {"timestamp": "2026-05-05T18:00:00Z", "status": "HEALTHY"},
        ],
        "data_freshness_timestamp": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def get_historical_failure_rates(counterparty_id: str) -> str:
    """
    Returns counterparty's settlement failure count and dates over the past 90 days.

    Args:
        counterparty_id: Single counterparty ID string.

    Returns:
        JSON object with failure_count_90d, failure_dates, avg_delay_days.
    """
    data = get_historical_failures().get(counterparty_id, {
        "failure_count_90d": 0,
        "failure_dates": [],
        "avg_delay_days": 0,
    })
    return json.dumps({"counterparty_id": counterparty_id, **data}, indent=2)


@tool
def get_securities_lending_depth(counterparty_id: str, security_ids: str) -> str:
    """
    Returns available lending inventory, current borrows, and net available securities per ISIN.

    Args:
        counterparty_id: Counterparty ID string.
        security_ids: JSON array of ISIN strings (e.g. '["ZAE000042811"]').

    Returns:
        JSON array of lending depth objects per security.
    """
    try:
        isins = json.loads(security_ids)
    except Exception:
        isins = []

    result = []
    lending = get_lending_depth()
    for isin in isins:
        key = (counterparty_id, isin)
        depth = lending.get(key, {
            "isin": isin,
            "available_inventory": None,
            "current_borrows": None,
            "required": None,
            "net_available": None,
            "shortfall_pct": None,
            "note": "No specific lending data — assume adequate",
        })
        result.append({"counterparty_id": counterparty_id, **depth})

    return json.dumps(result, indent=2)
