"""Mock Strate (South Africa's CSD) settlement roll tools."""
from __future__ import annotations

import json
from datetime import date, timedelta

from strands import tool

from .mock_data import STRATE_ELIGIBILITY, get_trades


def _next_business_day(d: str) -> str:
    """Return the next business day after date string d."""
    dt = date.fromisoformat(d)
    dt += timedelta(days=1)
    while dt.weekday() >= 5:  # Skip weekends
        dt += timedelta(days=1)
    return dt.isoformat()


@tool
def get_strate_roll_eligibility(trade_id: str) -> str:
    """
    Confirms whether a trade is eligible for a settlement roll per Strate rules.
    Not all trades can be rolled — depends on instrument type and original settlement date.

    Args:
        trade_id: Trade ID string (e.g. 'TRD-2002').

    Returns:
        JSON object with eligible (bool), max_roll_days, instrument_type, and reason.
    """
    eligibility = STRATE_ELIGIBILITY.get(trade_id)
    if eligibility:
        return json.dumps({"trade_id": trade_id, **eligibility}, indent=2)

    # Default: check against trade data
    trades = get_trades()
    trade = next((t for t in trades if t["trade_id"] == trade_id), None)
    if not trade:
        return json.dumps({"trade_id": trade_id, "eligible": False, "reason": "Trade not found in TIS"}, indent=2)

    return json.dumps({
        "trade_id": trade_id,
        "eligible": True,
        "max_roll_days": 1,
        "instrument_type": "EQUITY",
        "reason": "Standard equity — T+3 to T+4 roll available",
    }, indent=2)


@tool
def format_strate_roll_instruction(
    trade_id: str,
    current_settlement_date: str,
    new_settlement_date: str,
    reason_code: str,
) -> str:
    """
    Returns a Strate-formatted roll instruction object per ISO 20022 / Strate SWIFT format.

    Args:
        trade_id: Trade ID string.
        current_settlement_date: Original settlement date (ISO format).
        new_settlement_date: New deferred settlement date (ISO format).
        reason_code: One of SECURITIES_SHORTFALL, LIQUIDITY_CONSTRAINT, OPERATIONAL_DELAY, COUNTERPARTY_REQUEST.

    Returns:
        JSON object in Strate SWIFT/ISO 20022 roll instruction format.
    """
    trades = get_trades()
    trade = next((t for t in trades if t["trade_id"] == trade_id), {})

    valid_codes = {"SECURITIES_SHORTFALL", "LIQUIDITY_CONSTRAINT", "OPERATIONAL_DELAY", "COUNTERPARTY_REQUEST"}
    if reason_code not in valid_codes:
        reason_code = "OPERATIONAL_DELAY"

    return json.dumps({
        "message_type": "MT543_SETTLEMENT_ROLL",
        "format": "ISO_20022_SETI",
        "trade_id": trade_id,
        "isin": trade.get("isin", "UNKNOWN"),
        "instrument": trade.get("instrument", "UNKNOWN"),
        "counterparty_id": trade.get("counterparty_id", "UNKNOWN"),
        "quantity": trade.get("quantity", 0),
        "value_zar": trade.get("value_zar", 0),
        "current_settlement_date": current_settlement_date,
        "new_settlement_date": new_settlement_date or _next_business_day(current_settlement_date),
        "reason_code": reason_code,
        "originator": "JSE_CCP",
        "instruction_status": "FORMATTED",
        "strate_participant_id": "JSE-PARTICIPANT-001",
    }, indent=2)
