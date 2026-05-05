"""
CSV data tools — one query function per record type.

All query tools support the same DB-style filter operators:
  {"field": "value"}              exact match
  {"field__in": ["v1","v2"]}      value in list
  {"field__gte": "2026-01-01"}    >= comparison (string/numeric)
  {"field__lte": "value"}         <= comparison
  {"field__contains": "text"}     case-insensitive substring match

CSV files:
  data/dummy/policies.csv         reference — never mutated at runtime
  data/dummy/claims_history.csv   reference — never mutated at runtime
  data/dummy/fraud_patterns.csv   reference — never mutated at runtime
  data/claims_metadata.csv        live — created/updated at runtime
"""
from __future__ import annotations

import csv
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from strands import tool

_AGENT_DIR = Path(__file__).parent.parent.parent  # agents/demo1/
_DUMMY = _AGENT_DIR / "data" / "dummy"
_LIVE = _AGENT_DIR / "data"

_POLICIES_CSV = _DUMMY / "policies.csv"
_HISTORY_CSV = _DUMMY / "claims_history.csv"
_FRAUD_CSV = _DUMMY / "fraud_patterns.csv"
_METADATA_CSV = _LIVE / "claims_metadata.csv"

# Columns for claims_metadata
_METADATA_COLUMNS = [
    "case_id", "created_at", "updated_at", "user_id", "policy_no",
    "claim_type", "priority", "status", "intake_status",
    "extraction_status", "documents_submitted", "extracted_summary",
    "validation_status", "coverage_limit", "deductible", "validation_notes",
    "medical_review_status", "diagnosis", "billed_amount",
    "recommended_coverage_amount", "discrepancy_details",
    "fraud_score", "fraud_recommendation", "fraud_flags",
    "adjudication_decision", "settlement_amount", "decision_reason",
    "qa_verdict", "qa_comments", "qa_attempts", "qa_confidence",
    "approval_status", "approver_id", "approval_notes", "approval_timestamp",
    "override_decision", "override_amount",
    "communication_status", "email_file_path", "last_communication_at",
]

_csv_lock = threading.Lock()


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    os.replace(tmp, str(path))


def _apply_filters(rows: list[dict], filters: dict) -> list[dict]:
    result = []
    for row in rows:
        match = True
        for key, value in filters.items():
            if "__" in key:
                field, op = key.rsplit("__", 1)
                cell = row.get(field, "")
                if op == "in":
                    if cell not in [str(v) for v in value]:
                        match = False; break
                elif op == "gte":
                    if str(cell) < str(value):
                        match = False; break
                elif op == "lte":
                    if str(cell) > str(value):
                        match = False; break
                elif op == "contains":
                    if str(value).lower() not in str(cell).lower():
                        match = False; break
            else:
                if str(row.get(key, "")) != str(value):
                    match = False; break
        if match:
            result.append(row)
    return result


def _format_result(rows: list[dict], columns: list[str] | None) -> str:
    if not rows:
        return "No records found."
    if columns:
        rows = [{c: r.get(c, "") for c in columns if c in r or True} for r in rows]
    return json.dumps(rows, indent=2)


# ── Case ID generation ────────────────────────────────────────────────────────

@tool
def generate_case_id() -> str:
    """
    Generate a unique case identifier in the format CLM-YYYYMMDD-NNNN.
    Call this FIRST when creating a new claim case, before create_case_record.

    Returns:
        A unique case ID string, e.g. CLM-20260414-0042.
    """
    with _csv_lock:
        rows = _read_csv(_METADATA_CSV)
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        # Find highest sequence number for today
        prefix = f"CLM-{today}-"
        today_nums = [
            int(r["case_id"].split("-")[-1])
            for r in rows
            if r.get("case_id", "").startswith(prefix)
        ]
        seq = (max(today_nums) + 1) if today_nums else 1
        return f"CLM-{today}-{seq:04d}"


# ── Case record creation ──────────────────────────────────────────────────────

@tool
def create_case_record(
    case_id: str,
    user_id: str,
    policy_no: str,
    claim_type: str,
    priority: str,
) -> str:
    """
    Create a new row in claims_metadata.csv for a newly submitted claim.
    Call this after generate_case_id, during intake processing.

    Args:
        case_id:    The case identifier from generate_case_id.
        user_id:    The claimant's user ID (e.g. USR-001).
        policy_no:  The policy number (e.g. POL-1001).
        claim_type: Claim type — auto | property | health | liability.
        priority:   Triage priority — low | medium | high | critical.

    Returns:
        "ok" on success, or an error message.
    """
    now = _now()
    row = {col: "" for col in _METADATA_COLUMNS}
    row.update({
        "case_id": case_id,
        "created_at": now,
        "updated_at": now,
        "user_id": user_id,
        "policy_no": policy_no,
        "claim_type": claim_type,
        "priority": priority,
        "status": "intake_complete",
        "intake_status": "complete",
    })
    with _csv_lock:
        rows = _read_csv(_METADATA_CSV)
        if any(r.get("case_id") == case_id for r in rows):
            return f"ERROR: case_id {case_id} already exists."
        rows.append(row)
        _write_csv(_METADATA_CSV, rows, _METADATA_COLUMNS)
    return "ok"


# ── Case record update ────────────────────────────────────────────────────────

@tool
def update_case_csv(case_id: str, fields: str) -> str:
    """
    Update specific columns for an existing case in claims_metadata.csv.
    Use this after every sub-agent completes its work to record results.

    Args:
        case_id: The case identifier.
        fields:  JSON string of {column_name: value} pairs to update.
                 Example: '{"status": "validated", "coverage_limit": "50000"}'

    Returns:
        "ok" on success, or an error message.
    """
    try:
        updates = json.loads(fields) if isinstance(fields, str) else fields
    except (json.JSONDecodeError, TypeError) as e:
        return f"ERROR: fields must be valid JSON: {e}"

    with _csv_lock:
        rows = _read_csv(_METADATA_CSV)
        updated = False
        for row in rows:
            if row.get("case_id") == case_id:
                row.update(updates)
                row["updated_at"] = _now()
                updated = True
                break
        if not updated:
            return f"ERROR: case_id {case_id} not found."
        _write_csv(_METADATA_CSV, rows, _METADATA_COLUMNS)
    return "ok"


# ── Policy queries ────────────────────────────────────────────────────────────

@tool
def query_policies(
    filters: str = "{}",
    columns: str = "[]",
    limit: int = 10,
) -> str:
    """
    Query the policies reference table.
    Use this to verify a policy exists, check its status, get coverage limits,
    deductibles, covered claim types, exclusions, and holder contact details.

    Args:
        filters: JSON string of filter conditions. Supported operators:
                 {"policy_no": "POL-1001"}           exact match
                 {"status": "active"}                exact match
                 {"holder_name__contains": "Smith"}  substring
                 {"coverage_limit__gte": "20000"}    >= comparison
        columns: JSON array of column names to return. Empty = all columns.
                 Available: policy_no, holder_name, user_id, email, phone,
                 policy_type, start_date, end_date, status, coverage_limit,
                 deductible, covered_claim_types, exclusions, premium_monthly
        limit:   Maximum number of rows to return (default 10).

    Returns:
        JSON array of matching policy records, or "No records found."
    """
    try:
        f = json.loads(filters) if isinstance(filters, str) else filters
        c = json.loads(columns) if isinstance(columns, str) else columns
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON: {e}"

    rows = _read_csv(_POLICIES_CSV)
    rows = _apply_filters(rows, f)[:limit]
    return _format_result(rows, c or None)


# ── Claims history queries ─────────────────────────────────────────────────────

@tool
def query_claims_history(
    filters: str = "{}",
    columns: str = "[]",
    limit: int = 20,
) -> str:
    """
    Query the historical claims table (prior closed claims).
    Use this to check claim frequency, prior amounts, and fraud patterns.

    Args:
        filters: JSON filter conditions. Supported operators: exact, __in,
                 __gte, __lte, __contains.
                 Example: {"policy_no": "POL-1004", "claim_date__gte": "2026-01-01"}
        columns: JSON array of columns to return. Empty = all.
                 Available: claim_id, policy_no, user_id, claim_date,
                 claim_type, claimed_amount, status, fraud_flagged
        limit:   Maximum rows to return (default 20).

    Returns:
        JSON array of matching claim history records.
    """
    try:
        f = json.loads(filters) if isinstance(filters, str) else filters
        c = json.loads(columns) if isinstance(columns, str) else columns
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON: {e}"

    rows = _read_csv(_HISTORY_CSV)
    rows = _apply_filters(rows, f)[:limit]
    return _format_result(rows, c or None)


# ── Fraud pattern queries ─────────────────────────────────────────────────────

@tool
def query_fraud_patterns(
    filters: str = "{}",
    columns: str = "[]",
    limit: int = 20,
) -> str:
    """
    Query the fraud patterns reference table.
    Use this to check if a policy or user has known fraud risk records.

    Args:
        filters: JSON filter conditions.
                 Example: {"policy_no": "POL-1004"}
                 Example: {"risk_level": "high"}
                 Example: {"user_id": "USR-004"}
        columns: JSON array of columns to return. Empty = all.
                 Available: pattern_id, policy_no, user_id, flag_type,
                 description, risk_level, flagged_date
        limit:   Maximum rows to return (default 20).

    Returns:
        JSON array of matching fraud pattern records.
    """
    try:
        f = json.loads(filters) if isinstance(filters, str) else filters
        c = json.loads(columns) if isinstance(columns, str) else columns
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON: {e}"

    rows = _read_csv(_FRAUD_CSV)
    rows = _apply_filters(rows, f)[:limit]
    return _format_result(rows, c or None)


# ── Claims metadata queries ───────────────────────────────────────────────────

@tool
def query_claims_metadata(
    filters: str = "{}",
    columns: str = "[]",
    limit: int = 20,
    role: str = "support_exec",
    user_id: str = "",
) -> str:
    """
    Query the live claims metadata table (active and historical cases).
    Role-gated: end_user is automatically restricted to their own cases only.

    Args:
        filters: JSON filter conditions.
                 Example: {"case_id": "CLM-20260414-0001"}
                 Example: {"status__in": ["pending_approval","escalated_to_human"]}
                 Example: {"claim_type": "health"}
                 Example: {"policy_no": "POL-1001"}
        columns: JSON array of columns to return. Empty = all columns.
        limit:   Maximum rows to return (default 20).
        role:    Caller role — end_user | support_exec | admin.
                 end_user is restricted to their own user_id automatically.
        user_id: Required when role=end_user.

    Returns:
        JSON array of matching case records.
    """
    try:
        f = json.loads(filters) if isinstance(filters, str) else filters
        c = json.loads(columns) if isinstance(columns, str) else columns
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON: {e}"

    # Role-gate: end_user can only see their own cases
    if role == "end_user":
        if not user_id:
            return "ERROR: user_id is required for end_user role."
        f["user_id"] = user_id

    rows = _read_csv(_METADATA_CSV)
    rows = _apply_filters(rows, f)[:limit]
    return _format_result(rows, c or None)


# ── Human approval / override ─────────────────────────────────────────────────

@tool
def approve_case(
    case_id: str,
    approver_id: str,
    decision: str,
    notes: str,
    override_decision: str = "",
    override_amount: str = "",
) -> str:
    """
    Record human approval, rejection, or override of a claim decision.
    Only callable by support_exec or admin roles.
    On approval or override, the communication_agent should be invoked next.

    Args:
        case_id:           The case identifier.
        approver_id:       The reviewer's ID (e.g. SUPP-007).
        decision:          One of: approved | rejected | overridden
        notes:             Human reviewer's comments or reason.
        override_decision: (if decision=overridden) New decision type:
                           approved | partial | denied
        override_amount:   (if decision=overridden) New settlement amount as string,
                           e.g. "6000.00"

    Returns:
        "ok" on success, or an error message.
    """
    valid_decisions = {"approved", "rejected", "overridden"}
    if decision not in valid_decisions:
        return f"ERROR: decision must be one of {valid_decisions}"

    now = _now()
    updates: dict = {
        "approval_status": decision,
        "approver_id": approver_id,
        "approval_notes": notes,
        "approval_timestamp": now,
    }
    if decision == "overridden":
        if not override_decision:
            return "ERROR: override_decision is required when decision=overridden"
        updates["override_decision"] = override_decision
        if override_amount:
            updates["override_amount"] = override_amount
            updates["settlement_amount"] = override_amount
        updates["adjudication_decision"] = override_decision
        updates["status"] = "approved_for_comm"
    elif decision == "approved":
        updates["status"] = "approved_for_comm"
    elif decision == "rejected":
        updates["status"] = "rejected"

    with _csv_lock:
        rows = _read_csv(_METADATA_CSV)
        updated = False
        for row in rows:
            if row.get("case_id") == case_id:
                row.update(updates)
                row["updated_at"] = now
                updated = True
                break
        if not updated:
            return f"ERROR: case_id {case_id} not found."
        _write_csv(_METADATA_CSV, rows, _METADATA_COLUMNS)
    return "ok"
