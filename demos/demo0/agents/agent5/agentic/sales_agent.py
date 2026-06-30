"""
Sales sub-agent for agent5 (exposed to the concierge as function-call tools).

Per the Nova Sonic multi-agent pattern, specialist agents are surfaced to the
supervisor as tools. This module is the sales specialist: it recommends the right
Trianz offering for a stated need (grounded in the knowledge base) and captures a
qualified lead to ``state/data/leads/``. No CRM — leads are durable JSON the Support
persona can read back through the operations-aware chat.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from strands import tool

from commons.logger import get_logger

from . import knowledge
from .memory_backend import get_memory_store
from .paths import LEADS_DIR

logger = get_logger(__name__)


@tool
def recommend_offering(need: str) -> str:
    """
    Recommend the most relevant Trianz offering(s) for a stated business need, grounded
    in the Trianz knowledge base. Use this when a visitor describes a goal or problem
    (e.g. "we want to cut cloud spend" or "migrate our data centre to AWS").

    Args:
        need: The visitor's stated need, goal, or problem in their own words.

    Returns:
        JSON string: {"need", "matches": [{"title", "source", "text"}], "suggestion"}.
        Phrase a concise recommendation from the matches; never invent offerings.
    """
    matches = knowledge.search(need, k=3)
    suggestion = (
        "Tie the recommendation to one or two named Trianz offerings from the matches, "
        "explain the outcome it drives, and offer to set up a conversation with a specialist."
    )
    return json.dumps({"need": need, "matches": matches, "suggestion": suggestion}, ensure_ascii=False)


@tool
def capture_lead(
    email: str,
    name: str = "",
    company: str = "",
    interest: str = "",
    notes: str = "",
) -> str:
    """
    Capture a qualified sales lead to durable storage. Call this once a visitor has
    expressed genuine interest and you have at least their email.

    Args:
        email: The visitor's (already verified) work email — required.
        name: The visitor's name, if given.
        company: The visitor's company, if given.
        interest: Which Trianz offering / topic they're interested in.
        notes: Any extra qualifying context worth recording.

    Returns:
        JSON string: {"ok": true, "lead_id": "..."} or {"ok": false, "error": "..."}.
    """
    if not email or "@" not in email:
        return json.dumps({"ok": False, "error": "a valid email is required to capture a lead"})

    LEADS_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    lead_id = f"LEAD-{now.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    lead = {
        "lead_id": lead_id,
        "email": email.strip().lower(),
        "name": name.strip(),
        "company": company.strip(),
        "interest": interest.strip(),
        "notes": notes.strip(),
        "created_at": now.isoformat(),
    }
    path = LEADS_DIR / f"{lead_id}.json"
    tmp = str(path) + ".tmp"
    import os
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(lead, f, indent=2, ensure_ascii=False)
    os.replace(tmp, str(path))

    try:
        get_memory_store().add_episode({"kind": "lead_captured", "lead_id": lead_id,
                                        "email": lead["email"], "interest": lead["interest"]})
    except Exception as exc:  # pragma: no cover - memory must never break a tool
        logger.warning("[SALES] episode_write_failed  error=%s", exc)

    logger.info("[SALES] lead_captured  lead_id=%s email=%s", lead_id, lead["email"])
    return json.dumps({"ok": True, "lead_id": lead_id})
