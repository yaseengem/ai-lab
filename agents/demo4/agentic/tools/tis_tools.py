"""Mock TIS (Trade & Instruction System) API tools."""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from strands import tool

from .mock_data import get_counterparty_profiles, get_trades, next_roll_confirmation


@tool
def get_tis_open_trades(settlement_dates: str) -> str:
    """
    Returns all open trades with pending settlement obligations from TIS.

    Args:
        settlement_dates: JSON object with 't1_date' and 't2_date' ISO date strings,
                          or a JSON array of date strings.

    Returns:
        JSON object with t1_trades and t2_trades arrays.
    """
    trades = get_trades()
    t1 = [t for t in trades if t["settlement_window"] == "T+1"]
    t2 = [t for t in trades if t["settlement_window"] == "T+2"]
    return json.dumps({
        "t1_trades": t1,
        "t2_trades": t2,
        "total_trades": len(trades),
        "data_freshness_timestamp": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def submit_roll_to_tis(roll_instruction: str) -> str:
    """
    Submits a settlement roll instruction through TIS to the CIS layer for forwarding to Strate.

    Args:
        roll_instruction: JSON object with trade_id, current_settlement_date, new_settlement_date,
                          reason_code, and formatted_instruction fields.

    Returns:
        JSON object with submission_reference and status.
    """
    time.sleep(0.1)  # Simulate network call
    try:
        instr = json.loads(roll_instruction)
    except Exception:
        instr = {}
    confirmation = next_roll_confirmation()
    return json.dumps({
        "submission_reference": confirmation["submission_reference"],
        "status": "SUBMITTED",
        "trade_id": instr.get("trade_id", "UNKNOWN"),
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def get_roll_confirmation(submission_reference: str) -> str:
    """
    Polls Strate confirmation status for a submitted settlement roll instruction.

    Args:
        submission_reference: The reference returned by submit_roll_to_tis.

    Returns:
        JSON object with strate_confirmation_ref, status (ACCEPTED/PENDING/REJECTED).
    """
    return json.dumps({
        "submission_reference": submission_reference,
        "status": "ACCEPTED",
        "strate_confirmation_ref": submission_reference.replace("ROLL-TEST", "STR-CONF"),
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def notify_counterparty(counterparty_id: str, roll_details: str) -> str:
    """
    Sends an automated notification to a counterparty via CIS messaging channel about a settlement roll.

    Args:
        counterparty_id: Counterparty ID string.
        roll_details: JSON object with roll details (trade_id, new_settlement_date, reason).

    Returns:
        JSON object with notification_id and delivery_status.
    """
    cp = get_counterparty_profiles().get(counterparty_id, {})
    return json.dumps({
        "counterparty_id": counterparty_id,
        "counterparty_name": cp.get("name", "Unknown"),
        "notification_id": f"NOTIF-{counterparty_id}-{int(time.time())}",
        "delivery_status": "DELIVERED",
        "channel": "CIS_SECURE_MESSAGE",
        "delivered_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)
