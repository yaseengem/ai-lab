"""
Tests for agent5 (Trianz Concierge) core logic: the SES email-OTP gate, the
knowledge layer, and the sales/scheduling sub-agents. Run from demos/demo0.

No AWS is required — SES falls back to dev delivery, so the OTP and meeting flows
are exercised end-to-end without sending real email.
"""

from __future__ import annotations

import json
import shutil

import pytest

from agents.agent5.agentic import knowledge, paths
from agents.agent5.agentic import sales_agent, scheduling_agent
from agents.agent5.agentic.tools import auth, email_ses


@pytest.fixture(autouse=True)
def clean_state():
    shutil.rmtree(paths.STATE_DIR, ignore_errors=True)
    paths.ensure_state_dirs()
    yield
    shutil.rmtree(paths.STATE_DIR, ignore_errors=True)


# ── auth: allowlist + public-domain block ─────────────────────────────────────

def test_allowlist_accepts_business_and_subdomain():
    assert auth.validate_email("jane@trianz.com") == (True, "ok")
    assert auth.validate_email("jane@us.trianz.com") == (True, "ok")


def test_public_domain_is_blocked():
    ok, reason = auth.validate_email("jane@gmail.com")
    assert ok is False and reason == "public_email_blocked"


def test_domain_outside_allowlist_rejected():
    ok, reason = auth.validate_email("jane@acme.com")
    assert ok is False and reason == "domain_not_allowed"


def test_invalid_email_rejected():
    assert auth.validate_email("not-an-email")[0] is False


# ── auth: OTP dev flow (no SES) ───────────────────────────────────────────────

def test_otp_request_verify_dev_flow():
    r = auth.request_otp("jane@trianz.com")
    assert r["ok"] is True and r["delivery"] == "dev" and r.get("dev_code")
    code = r["dev_code"]

    bad = auth.verify_otp("jane@trianz.com", "000000")
    assert bad["ok"] is False and bad["reason"] == "wrong_code"

    good = auth.verify_otp("jane@trianz.com", code)
    assert good["ok"] is True and good.get("token")
    assert auth.check_session(good["token"]) is not None
    assert auth.check_session("bogus-token") is None


def test_otp_not_issued_for_public_email():
    r = auth.request_otp("jane@gmail.com")
    assert r["ok"] is False and r["reason"] == "public_email_blocked"


# ── knowledge ─────────────────────────────────────────────────────────────────

def test_knowledge_search_finds_concierto():
    knowledge.build_index()
    hits = knowledge.search("concierto cloud cost optimization", k=3)
    assert hits, "expected at least one knowledge hit"
    assert any("Concierto" in h["title"] or "concierto" in h["text"].lower() for h in hits)


def test_overview_text_nonempty():
    knowledge.build_index()
    assert "Trianz" in knowledge.overview_text()


# ── sub-agents ────────────────────────────────────────────────────────────────

def test_capture_lead_writes_durable_record():
    out = json.loads(sales_agent.capture_lead(email="jane@trianz.com", interest="FinOps"))
    assert out["ok"] is True
    lead_id = out["lead_id"]
    assert (paths.LEADS_DIR / f"{lead_id}.json").exists()


def test_capture_lead_requires_email():
    out = json.loads(sales_agent.capture_lead(email=""))
    assert out["ok"] is False


def test_build_ics_has_required_fields():
    from datetime import datetime, timezone
    start = datetime(2026, 7, 2, 15, 0, tzinfo=timezone.utc)
    ics = email_ses.build_ics(
        summary="Trianz chat", description="About migration", start=start,
        end=start, organizer_email="sales@trianz.com", attendee_email="jane@trianz.com")
    for marker in ("BEGIN:VCALENDAR", "BEGIN:VEVENT", "SUMMARY:Trianz chat", "DTSTART:", "END:VCALENDAR"):
        assert marker in ics


def test_request_meeting_records_even_without_ses():
    out = json.loads(scheduling_agent.request_human_meeting(
        email="jane@trianz.com", topic="cloud migration"))
    assert out["ok"] is True
    assert out["email_sent"] is False  # no ses_sender configured in the test
    assert (paths.MEETINGS_DIR / f"{out['meeting_id']}.json").exists()
