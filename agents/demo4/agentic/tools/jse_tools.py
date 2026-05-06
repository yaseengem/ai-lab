"""Mock JSE rules, LOLR capacity, watchlist, and historical settlement tools."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from strands import tool

from .mock_data import get_counterparty_profiles, get_historical_failures, get_jse_watchlist, LOLR_CAPACITY


@tool
def check_jse_watchlist(counterparty_id: str) -> str:
    """
    Returns any active JSE watchlist entries, regulatory notices, or CCP risk flags for a counterparty.

    Args:
        counterparty_id: Counterparty ID string.

    Returns:
        JSON object with active (bool), entries list, and any CCP risk flags.
    """
    entry = get_jse_watchlist().get(counterparty_id, {"active": False, "entries": []})
    return json.dumps({"counterparty_id": counterparty_id, **entry}, indent=2)


@tool
def get_historical_settlement_record(counterparty_id: str, lookback_days: int = 90) -> str:
    """
    Returns historical settlement failure rate, average delay, and failure root causes.

    Args:
        counterparty_id: Counterparty ID string.
        lookback_days: Number of days to look back (default 90).

    Returns:
        JSON object with failure_count, failure_rate_pct, avg_delay_days, root_causes.
    """
    data = get_historical_failures().get(counterparty_id, {"failure_count_90d": 0, "failure_dates": [], "avg_delay_days": 0})
    failure_count = data.get("failure_count_90d") or 0
    # Approx 252 settlement days per year → ~63 in 90 days
    rate_pct = round((failure_count / 63) * 100, 2) if failure_count else 0.0
    return json.dumps({
        "counterparty_id": counterparty_id,
        "lookback_days": lookback_days,
        "failure_count": failure_count,
        "failure_rate_pct": rate_pct,
        "failure_dates": data.get("failure_dates") or [],
        "avg_delay_days": data.get("avg_delay_days") or 0,
        "root_causes": ["SECURITIES_SHORTFALL"] if failure_count else [],
        "data_available": data.get("failure_count_90d") is not None,
    }, indent=2)


@tool
def get_jse_rulebook_guidance(scenario_type: str) -> str:
    """
    Returns applicable JSE rules and constraints for a given intervention scenario.

    Args:
        scenario_type: One of LOLR, ROLL, SUSPENSION, ALERT, ESCALATION.

    Returns:
        JSON object with applicable rules, constraints, and regulatory citations.
    """
    rules = {
        "LOLR": {
            "scenario": "LOLR",
            "authority": "JSE CCP Rulebook Section 14.3 — Lender of Last Resort",
            "conditions": [
                "JSE acts as CCP and may step in as borrower/lender to guarantee settlement",
                "LOLR may only be triggered when failure probability exceeds HIGH threshold",
                "Maximum ZAR 500M in LOLR transactions per single execution cycle without Head of Clearing approval",
                "All LOLR transactions require regulatory_basis field citing specific CCP rule",
            ],
            "constraints": ["LOLR capacity must be confirmed before trigger", "Regulatory flag items always require human approval"],
        },
        "ROLL": {
            "scenario": "ROLL",
            "authority": "JSE Settlement Rules Section 8.2 — Settlement Roll Instructions",
            "conditions": [
                "Equity trades may only be rolled from T+3 to T+4 maximum (one additional day)",
                "Roll instructions must be submitted at least 2 hours before market close",
                "Counterparty must be notified within 15 minutes of roll submission",
                "ETFs and bonds have different roll windows — check eligibility per instrument",
            ],
            "reason_codes": ["SECURITIES_SHORTFALL", "LIQUIDITY_CONSTRAINT", "OPERATIONAL_DELAY", "COUNTERPARTY_REQUEST"],
        },
        "SUSPENSION": {
            "scenario": "SUSPENSION",
            "authority": "JSE CCP Rulebook Section 18 — Member Suspension",
            "conditions": ["Requires Head of Clearing approval", "Regulatory notification to FSCA required within 24 hours"],
            "constraints": ["Human approval mandatory — never auto-execute"],
        },
        "ALERT": {
            "scenario": "ALERT",
            "authority": "JSE Operations Manual Section 3.1 — Risk Monitoring",
            "conditions": ["Operations team notified via SNS for all MEDIUM and above risk items", "No auto-intervention for ALERT type"],
        },
        "ESCALATION": {
            "scenario": "ESCALATION",
            "authority": "JSE CCP Rulebook Section 22 — Human Escalation",
            "conditions": [
                "Regulatory flag items always escalate",
                "Systemic risk flag (3+ simultaneous CRITICAL) triggers full escalation",
                "20-minute approval timeout after which item escalates to CRITICAL",
            ],
        },
    }
    guidance = rules.get(scenario_type.upper(), {"scenario": scenario_type, "guidance": "No specific rulebook entry found — consult Head of Clearing"})
    return json.dumps(guidance, indent=2)


@tool
def calculate_intervention_cost(intervention_type: str, trade_details: str) -> str:
    """
    Returns estimated cost/penalty/fee for each intervention option.

    Args:
        intervention_type: One of LOLR_TRIGGER, SETTLEMENT_ROLL, ALERT_OPERATIONS, HUMAN_ESCALATION.
        trade_details: JSON object with trade_id, value_zar, counterparty_id.

    Returns:
        JSON object with estimated_cost_zar and cost_breakdown.
    """
    try:
        td = json.loads(trade_details)
    except Exception:
        td = {}
    value = td.get("value_zar", 0) or 0

    cost_map = {
        "LOLR_TRIGGER": {
            "basis_points": 15,
            "description": "LOLR facility fee: 15bps of trade value",
            "estimated_cost_zar": round(value * 0.0015),
        },
        "SETTLEMENT_ROLL": {
            "basis_points": 5,
            "description": "Strate roll fee: 5bps + counterparty penalty (typically ZAR 25,000)",
            "estimated_cost_zar": round(value * 0.0005) + 25_000,
        },
        "ALERT_OPERATIONS": {
            "basis_points": 0,
            "description": "Operational cost only — no direct market fee",
            "estimated_cost_zar": 5_000,
        },
        "HUMAN_ESCALATION": {
            "basis_points": 0,
            "description": "Operational escalation cost + potential penalty if settlement fails",
            "estimated_cost_zar": 10_000,
        },
    }
    breakdown = cost_map.get(intervention_type, {"description": "Unknown intervention type", "estimated_cost_zar": 0})
    return json.dumps({
        "intervention_type": intervention_type,
        "trade_id": td.get("trade_id", "UNKNOWN"),
        "value_zar": value,
        **breakdown,
    }, indent=2)


@tool
def check_lolr_capacity(security_id: str, quantity: int) -> str:
    """
    Confirms JSE has sufficient lending capacity to fulfil a LOLR transaction.

    Args:
        security_id: ISIN of the security (e.g. 'ZAE000042811').
        quantity: Number of units required for the LOLR transaction.

    Returns:
        JSON object with capacity_available (bool), available_units, available_zar.
    """
    cap = LOLR_CAPACITY.get(security_id)
    if not cap:
        return json.dumps({
            "security_id": security_id,
            "capacity_available": False,
            "reason": "Security not in LOLR eligible inventory",
        }, indent=2)
    sufficient = cap["available_units"] >= quantity
    return json.dumps({
        "security_id": security_id,
        "security_name": cap["security"],
        "capacity_available": sufficient,
        "available_units": cap["available_units"],
        "available_zar": cap["available_zar"],
        "requested_units": quantity,
        "shortfall_units": max(0, quantity - cap["available_units"]),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)
