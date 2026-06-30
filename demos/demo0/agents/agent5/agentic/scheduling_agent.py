"""
Scheduling sub-agent for agent5 (exposed to the concierge as a function-call tool).

When a visitor wants to talk to a human, this specialist records the request to
``state/data/meetings/`` and emails the visitor a calendar (``.ics``) invite via real
AWS SES, with a Trianz sales contact as the organizer. No CRM and no OAuth calendar —
the invite IS the booking. If HITL approval is enabled the run can be gated before the
email goes out; the tool itself is idempotent per meeting id.
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone

from strands import tool

from commons.logger import get_logger

from . import knowledge  # noqa: F401  (kept for parity; specialists may ground replies)
from .memory_backend import get_memory_store
from .paths import MEETINGS_DIR
from .tools import email_ses

logger = get_logger(__name__)

_DEFAULT_DURATION_MIN = 30


def _sales_contact() -> str:
    try:
        from agents.agent5.apis.service import effective_config
        defaults = effective_config().get("defaults") or {}
        return str(defaults.get("sales_contact_email") or defaults.get("ses_sender") or "").strip()
    except Exception:  # pragma: no cover - defensive
        return ""


def _parse_start(preferred_time: str) -> datetime:
    """Best-effort parse of a preferred time; default = tomorrow 15:00 UTC."""
    preferred_time = (preferred_time or "").strip()
    if preferred_time:
        for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(preferred_time, fmt)
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    tomorrow = datetime.now(timezone.utc) + timedelta(days=1)
    return tomorrow.replace(hour=15, minute=0, second=0, microsecond=0)


@tool
def request_human_meeting(
    email: str,
    name: str = "",
    topic: str = "",
    preferred_time: str = "",
    notes: str = "",
) -> str:
    """
    Book a conversation with a Trianz human: record the request and email the visitor a
    calendar invite (.ics) via SES. Call this when a visitor asks to speak with someone,
    request a demo, or escalate to a person.

    Args:
        email: The visitor's (verified) work email — required; the invite is sent here.
        name: The visitor's name, if known.
        topic: What they want to discuss (e.g. "cloud migration for our data platform").
        preferred_time: Optional preferred time; ISO 8601 ("2026-07-02T15:00:00Z") parses
            exactly, otherwise a sensible default slot is proposed.
        notes: Any extra context to include for the Trianz contact.

    Returns:
        JSON string: {"ok", "meeting_id", "scheduled_for", "email_sent", "delivery"|"error"}.
    """
    if not email or "@" not in email:
        return json.dumps({"ok": False, "error": "a valid email is required to book a meeting"})

    organizer = _sales_contact()
    start = _parse_start(preferred_time)
    end = start + timedelta(minutes=_DEFAULT_DURATION_MIN)
    now = datetime.now(timezone.utc)
    meeting_id = f"MTG-{now.strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    topic = topic.strip() or "Trianz consultation"

    summary = f"Trianz × {name.strip() or email}: {topic}"
    description = (
        f"Conversation with a Trianz specialist about: {topic}.\n"
        f"Requested by: {name.strip() or email} ({email}).\n"
        + (f"Notes: {notes.strip()}\n" if notes.strip() else "")
    )

    record = {
        "meeting_id": meeting_id,
        "email": email.strip().lower(),
        "name": name.strip(),
        "topic": topic,
        "organizer": organizer,
        "scheduled_for": start.isoformat(),
        "duration_min": _DEFAULT_DURATION_MIN,
        "notes": notes.strip(),
        "created_at": now.isoformat(),
        "email_sent": False,
        "delivery": None,
    }

    send: dict = {"sent": False, "error": "no_organizer_or_sender_configured"}
    if organizer:
        ics = email_ses.build_ics(
            summary=summary, description=description, start=start, end=end,
            organizer_email=organizer, attendee_email=email.strip().lower(),
        )
        body_text = (
            f"Hi {name.strip() or 'there'},\n\n"
            f"Thanks for your interest in Trianz. We've set up a 30-minute conversation about "
            f"\"{topic}\". The calendar invite is attached — feel free to propose another time "
            f"by replying.\n\nWhen: {start.strftime('%A %d %b %Y, %H:%M UTC')}\n\n— Trianz Concierge"
        )
        send = email_ses.send_meeting_email(
            to_address=email.strip().lower(),
            subject=f"Your Trianz conversation: {topic}",
            body_text=body_text,
            ics_text=ics,
        )
        record["email_sent"] = bool(send.get("sent"))
        record["delivery"] = "ses" if send.get("sent") else "failed"

    MEETINGS_DIR.mkdir(parents=True, exist_ok=True)
    path = MEETINGS_DIR / f"{meeting_id}.json"
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)
    os.replace(tmp, str(path))

    try:
        get_memory_store().add_episode({"kind": "meeting_requested", "meeting_id": meeting_id,
                                        "email": record["email"], "topic": topic,
                                        "email_sent": record["email_sent"]})
    except Exception as exc:  # pragma: no cover
        logger.warning("[SCHED] episode_write_failed  error=%s", exc)

    logger.info("[SCHED] meeting_booked  meeting_id=%s email=%s sent=%s",
                meeting_id, record["email"], record["email_sent"])
    result = {
        "ok": True,
        "meeting_id": meeting_id,
        "scheduled_for": start.isoformat(),
        "email_sent": record["email_sent"],
    }
    if record["email_sent"]:
        result["delivery"] = "ses"
    else:
        result["error"] = send.get("error", "email_not_sent")
    return json.dumps(result, ensure_ascii=False)
