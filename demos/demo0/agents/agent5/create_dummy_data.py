"""
Generate seed/demo data for agent5 (Trianz Concierge).

Writes example **leads** and **meeting requests** into seeds/dummy/. This is sample
INPUT/illustrative data — committed to git, NOT runtime state. Real leads and meetings
the agent produces land under state/data/leads/ and state/data/meetings/ at runtime.

Run once from the repo root (demos/demo0):
    python agents/agent5/create_dummy_data.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).parent / "seeds" / "dummy"
OUT.mkdir(parents=True, exist_ok=True)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_LEADS = [
    {"lead_id": "LEAD-SAMPLE-001", "email": "priya@acmecorp.com", "name": "Priya N.",
     "company": "Acme Corp", "interest": "Concierto Migrate — data centre to AWS", "notes": "Targeting Q4."},
    {"lead_id": "LEAD-SAMPLE-002", "email": "sam@globex.io", "name": "Sam O.",
     "company": "Globex", "interest": "Maximize — FinOps / cloud cost optimization", "notes": "Spend up 30% YoY."},
]

_MEETINGS = [
    {"meeting_id": "MTG-SAMPLE-001", "email": "priya@acmecorp.com", "name": "Priya N.",
     "topic": "Cloud migration roadmap", "duration_min": 30, "notes": "Wants a specialist + reference."},
]


def write_leads() -> None:
    path = OUT / "sample_leads.json"
    payload = {"generated_at": _now(), "count": len(_LEADS), "leads": _LEADS}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  created: {path.relative_to(OUT.parent.parent)}")


def write_meetings() -> None:
    path = OUT / "sample_meetings.json"
    payload = {"generated_at": _now(), "count": len(_MEETINGS), "meetings": _MEETINGS}
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  created: {path.relative_to(OUT.parent.parent)}")


def main() -> None:
    write_leads()
    write_meetings()
    print(f"\nSeed data written to: {OUT}")


if __name__ == "__main__":
    main()
