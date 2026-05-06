"""
Mock audit, dashboard, FSCA reporting, and LOLR execution tools.

In production these would write to CloudTrail, update a live dashboard via API,
send SNS alerts, and store to S3. In the demo they write to local JSON files
under agents/demo4/data/.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from strands import tool

from .mock_data import next_lolr_confirmation

_AGENT_DIR = Path(__file__).parent.parent.parent  # agents/demo4/
_DATA_DIR = _AGENT_DIR / "data"
_AUDIT_DIR = _DATA_DIR / "audit"
_REPORTS_DIR = _DATA_DIR / "reports"
_DASHBOARD_FILE = _DATA_DIR / "dashboard.json"


def _ensure_dirs() -> None:
    _AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    _REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    _DATA_DIR.mkdir(parents=True, exist_ok=True)


# ── LOLR execution tools ──────────────────────────────────────────────────────

@tool
def construct_lolr_transaction(
    trade_id: str,
    counterparty_id: str,
    security_id: str,
    quantity: int,
    direction: str,
    settlement_date: str,
) -> str:
    """
    Builds a validated LOLR transaction object per JSE CCP rulebook format.

    Args:
        trade_id: Trade ID being covered.
        counterparty_id: Counterparty requiring LOLR coverage.
        security_id: ISIN of the security.
        quantity: Number of units to lend/borrow.
        direction: 'LEND' or 'BORROW'.
        settlement_date: Target settlement date (ISO format).

    Returns:
        JSON object representing the LOLR transaction per CCP rulebook.
    """
    return json.dumps({
        "transaction_type": "LOLR",
        "trade_id": trade_id,
        "counterparty_id": counterparty_id,
        "security_id": security_id,
        "quantity": quantity,
        "direction": direction,
        "settlement_date": settlement_date,
        "originator": "JSE_CCP",
        "regulatory_basis": "JSE CCP Rulebook Section 14.3 — Lender of Last Resort",
        "constructed_at": datetime.now(timezone.utc).isoformat(),
        "status": "CONSTRUCTED",
    }, indent=2)


@tool
def validate_lolr_transaction(transaction_object: str) -> str:
    """
    Validates a LOLR transaction against JSE internal limits, available inventory,
    and regulatory constraints.

    Args:
        transaction_object: JSON LOLR transaction object from construct_lolr_transaction.

    Returns:
        JSON object with validation_status (VALID/INVALID), checks_passed, and any failures.
    """
    try:
        txn = json.loads(transaction_object)
    except Exception:
        return json.dumps({"validation_status": "INVALID", "error": "Invalid JSON input"})

    checks = {
        "has_regulatory_basis": bool(txn.get("regulatory_basis")),
        "direction_valid": txn.get("direction") in {"LEND", "BORROW"},
        "quantity_positive": (txn.get("quantity") or 0) > 0,
        "security_id_present": bool(txn.get("security_id")),
        "counterparty_present": bool(txn.get("counterparty_id")),
    }
    all_passed = all(checks.values())
    return json.dumps({
        "validation_status": "VALID" if all_passed else "INVALID",
        "checks": checks,
        "validated_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def submit_lolr_transaction(validated_transaction: str) -> str:
    """
    Submits a validated LOLR transaction to JSE's CCP booking system.

    Args:
        validated_transaction: JSON validated transaction object from validate_lolr_transaction.

    Returns:
        JSON object with confirmation_id and status.
    """
    time.sleep(0.1)
    try:
        txn = json.loads(validated_transaction)
    except Exception:
        txn = {}
    confirmation = next_lolr_confirmation()
    return json.dumps({
        "trade_id": txn.get("trade_id", "UNKNOWN"),
        "counterparty_id": txn.get("counterparty_id", "UNKNOWN"),
        "status": confirmation["status"],
        "confirmation_id": confirmation["confirmation_id"],
        "booking_ref": confirmation["booking_ref"],
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "regulatory_basis": txn.get("regulatory_basis", "JSE CCP Rulebook Section 14.3"),
    }, indent=2)


@tool
def get_lolr_execution_status(confirmation_id: str) -> str:
    """
    Polls the execution status of a submitted LOLR transaction.

    Args:
        confirmation_id: Confirmation ID returned by submit_lolr_transaction.

    Returns:
        JSON object with status (CONFIRMED/PENDING/FAILED) and booking details.
    """
    return json.dumps({
        "confirmation_id": confirmation_id,
        "status": "CONFIRMED",
        "booking_status": "BOOKED",
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


# ── Reporting & audit tools ───────────────────────────────────────────────────

@tool
def write_audit_log(run_id: str, audit_entries: str) -> str:
    """
    Writes immutable audit entries to the CloudTrail-backed audit store.

    Args:
        run_id: Pipeline run ID (format: JSE-SFPP-YYYYMMDD-HHMM).
        audit_entries: JSON array of audit entry objects.

    Returns:
        JSON object confirming the audit log write.
    """
    _ensure_dirs()
    try:
        entries = json.loads(audit_entries)
    except Exception:
        entries = []
    audit_file = _AUDIT_DIR / f"{run_id}_audit.json"
    existing = []
    if audit_file.exists():
        try:
            existing = json.loads(audit_file.read_text(encoding="utf-8"))
        except Exception:
            existing = []
    all_entries = existing + entries
    tmp = str(audit_file) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(all_entries, f, indent=2)
    os.replace(tmp, str(audit_file))
    return json.dumps({
        "run_id": run_id,
        "entries_written": len(entries),
        "total_entries": len(all_entries),
        "audit_file": str(audit_file),
        "written_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def update_operations_dashboard(dashboard_payload: str) -> str:
    """
    Updates the JSE real-time operations dashboard with current risk summary and intervention status.

    Args:
        dashboard_payload: JSON object with operations_summary fields.

    Returns:
        JSON confirmation of dashboard update.
    """
    _ensure_dirs()
    try:
        payload = json.loads(dashboard_payload)
    except Exception:
        payload = {}
    payload["last_updated"] = datetime.now(timezone.utc).isoformat()
    tmp = str(_DASHBOARD_FILE) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    os.replace(tmp, str(_DASHBOARD_FILE))
    return json.dumps({"status": "updated", "dashboard_file": str(_DASHBOARD_FILE)}, indent=2)


@tool
def send_operations_alert(severity: str, message: str, recipients: str) -> str:
    """
    Sends real-time alerts to the JSE operations team for Critical-risk items and human escalations.

    Args:
        severity: Alert severity — HIGH, MEDIUM, or INFO.
        message: Alert message text.
        recipients: JSON array of recipient identifiers (e.g. '["ops-oncall", "head-of-clearing"]').

    Returns:
        JSON confirmation with alert_id and delivery status.
    """
    alert_id = f"ALERT-{int(time.time())}"
    try:
        recip = json.loads(recipients)
    except Exception:
        recip = ["ops-oncall"]
    print(f"[ALERT][{severity}] {message} → {recip}")
    return json.dumps({
        "alert_id": alert_id,
        "severity": severity,
        "message": message,
        "recipients": recip,
        "delivery_status": "DELIVERED",
        "channel": "SNS_MOCK",
        "sent_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def store_fsca_report(run_id: str, report_document: str) -> str:
    """
    Stores the FSCA compliance report in encrypted S3 (mock: local file).

    Args:
        run_id: Pipeline run ID.
        report_document: JSON object representing the full FSCA compliance report.

    Returns:
        JSON object with storage reference and confirmation.
    """
    _ensure_dirs()
    report_file = _REPORTS_DIR / f"{run_id}_fsca_report.json"
    try:
        doc = json.loads(report_document)
    except Exception:
        doc = {"raw": report_document}
    doc["stored_at"] = datetime.now(timezone.utc).isoformat()
    tmp = str(report_file) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=2)
    os.replace(tmp, str(report_file))
    return json.dumps({
        "run_id": run_id,
        "storage_ref": f"s3://jse-fsca-archive/{run_id}_fsca_report.json",
        "local_file": str(report_file),
        "stored_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)


@tool
def compare_with_prior_cycle(current_watchlist: str) -> str:
    """
    Compares the current risk profile with the previous pipeline run to identify deterioration trends.

    Args:
        current_watchlist: JSON object with settlement_watchlist array from Risk Scoring Agent.

    Returns:
        JSON object with trend_direction (IMPROVING/STABLE/DETERIORATING), critical_count_delta,
        and systemic_stress_indicator.
    """
    _ensure_dirs()
    try:
        wl = json.loads(current_watchlist)
    except Exception:
        wl = {}
    items = wl.get("settlement_watchlist", wl if isinstance(wl, list) else [])
    current_critical = sum(1 for i in items if i.get("risk_classification") == "CRITICAL")

    history_file = _DATA_DIR / "prior_cycle.json"
    prior_critical = 0
    if history_file.exists():
        try:
            prior = json.loads(history_file.read_text(encoding="utf-8"))
            prior_critical = prior.get("critical_count", 0)
        except Exception:
            prior_critical = 0

    # Save current for next comparison
    tmp = str(history_file) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"critical_count": current_critical, "timestamp": datetime.now(timezone.utc).isoformat()}, f)
    os.replace(tmp, str(history_file))

    delta = current_critical - prior_critical
    if delta > prior_critical * 0.5 and prior_critical > 0:
        trend = "DETERIORATING"
        systemic_stress = current_critical > 3
    elif delta < 0:
        trend = "IMPROVING"
        systemic_stress = False
    else:
        trend = "STABLE"
        systemic_stress = current_critical > 3

    return json.dumps({
        "current_critical_count": current_critical,
        "prior_critical_count": prior_critical,
        "critical_count_delta": delta,
        "trend_direction": trend,
        "systemic_stress_indicator": systemic_stress,
        "compared_at": datetime.now(timezone.utc).isoformat(),
    }, indent=2)
