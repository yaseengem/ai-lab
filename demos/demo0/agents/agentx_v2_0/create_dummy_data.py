"""
Generate seed/demo data for the v2.0 template agent.

Writes a few simple JSON + CSV records into data/dummy/ so a freshly copied
agent has something to show on first run. No heavy dependencies — standard
library only.

Run once from the repo root:
    python agents/agentx_v2_0/create_dummy_data.py
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).parent / "data" / "dummy"
OUT.mkdir(parents=True, exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── A small set of sample "records" the template can demonstrate against ──────
_RECORDS = [
    {"record_id": "REC-001", "subject": "Sample request A", "priority": "high",   "amount": 12000, "status": "open"},
    {"record_id": "REC-002", "subject": "Sample request B", "priority": "medium", "amount": 4570,  "status": "open"},
    {"record_id": "REC-003", "subject": "Sample request C", "priority": "low",     "amount": 820,   "status": "closed"},
    {"record_id": "REC-004", "subject": "Sample request D", "priority": "high",   "amount": 42500, "status": "open"},
]


def write_json() -> None:
    path = OUT / "sample_records.json"
    payload = {"generated_at": _now(), "count": len(_RECORDS), "records": _RECORDS}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  created: {path.relative_to(OUT.parent.parent)}")


def write_csv() -> None:
    path = OUT / "sample_records.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["record_id", "subject", "priority", "amount", "status"])
        writer.writeheader()
        writer.writerows(_RECORDS)
    print(f"  created: {path.relative_to(OUT.parent.parent)}")


def main() -> None:
    write_json()
    write_csv()
    print(f"\nSeed data written to: {OUT}")


if __name__ == "__main__":
    main()
