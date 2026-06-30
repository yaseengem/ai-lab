"""
Email-OTP authentication for agent5 (a real access gate, not a persona view).

Flow:
  1. request_otp(email)  — validate the email against the business-domain allowlist and
     the public-domain blocklist; if allowed, mint a 6-digit code, persist a durable
     challenge under state/auth/, and send it via real AWS SES (email_ses).
  2. verify_otp(email, code) — check the code; on success mint a durable session token.
  3. check_session(token) — gate the voice WS, /chat, and /run on a valid token.

Config (effective_config defaults, operator-overridable via setup.yaml):
  allowlist_domains      patterns like "trianz.com" or "*.trianz.com" (empty ⇒ allow any
                         non-public domain)
  blocked_public_domains gmail.com, yahoo.com, …  (always rejected)
  otp_ttl_seconds        code lifetime (default 600)

Durable + dependency-free: challenges/sessions are JSON files under state/auth/; codes use
``secrets``. If SES is not configured the code is returned in the API response with
``delivery="dev"`` so the agent is still testable end-to-end with zero AWS setup.
"""

from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from commons.logger import get_logger

from ..paths import AUTH_DIR
from . import email_ses

logger = get_logger(__name__)

# Sensible default blocklist of public/consumer email providers.
DEFAULT_PUBLIC_DOMAINS = [
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com",
    "hotmail.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com",
    "mac.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "mail.com",
    "yandex.com", "qq.com", "163.com",
]

_MAX_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _email_domain(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1] if "@" in email else ""


def _slug(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()[:24]


def _challenge_path(email: str):
    return AUTH_DIR / f"otp_{_slug(email)}.json"


def _session_path(token: str):
    safe = "".join(c for c in token if c.isalnum() or c in "-_")[:64]
    return AUTH_DIR / f"session_{safe}.json"


def _write_json(path, data: dict) -> None:
    AUTH_DIR.mkdir(parents=True, exist_ok=True)
    tmp = str(path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, str(path))


def _read_json(path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


# ── config ──────────────────────────────────────────────────────────────────

def _auth_config() -> dict:
    try:
        from agents.agent5.apis.service import effective_config
        defaults = effective_config().get("defaults") or {}
    except Exception:  # pragma: no cover - defensive
        defaults = {}
    blocked = [d.lower() for d in (defaults.get("blocked_public_domains") or DEFAULT_PUBLIC_DOMAINS)]
    allow = [p.lower() for p in (defaults.get("allowlist_domains") or [])]
    ttl = int(defaults.get("otp_ttl_seconds") or 600)
    return {"allowlist": allow, "blocked": blocked, "ttl": ttl}


def _domain_matches(domain: str, pattern: str) -> bool:
    if "*" in pattern or "?" in pattern:
        return fnmatch.fnmatch(domain, pattern)
    return domain == pattern or domain.endswith("." + pattern)


def validate_email(email: str) -> tuple[bool, str]:
    """Return (allowed, reason). reason is a short machine code on rejection, else 'ok'."""
    email = (email or "").strip().lower()
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return False, "invalid_email"
    domain = _email_domain(email)
    cfg = _auth_config()
    if any(_domain_matches(domain, b) for b in cfg["blocked"]):
        return False, "public_email_blocked"
    if cfg["allowlist"]:
        if not any(_domain_matches(domain, p) for p in cfg["allowlist"]):
            return False, "domain_not_allowed"
    return True, "ok"


# ── OTP lifecycle ─────────────────────────────────────────────────────────────

def request_otp(email: str) -> dict:
    """
    Validate the email and, if allowed, issue + send a one-time code.
    Returns {ok, reason, ttl_minutes, delivery, [dev_code]}.
    """
    email = (email or "").strip().lower()
    allowed, reason = validate_email(email)
    if not allowed:
        logger.info("[AUTH] otp_rejected  domain=%s reason=%s", _email_domain(email), reason)
        return {"ok": False, "reason": reason}

    cfg = _auth_config()
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = _now() + timedelta(seconds=cfg["ttl"])
    _write_json(_challenge_path(email), {
        "email": email,
        "code": code,
        "expires_at": expires.isoformat(),
        "attempts": 0,
        "created_at": _now().isoformat(),
    })

    ttl_minutes = max(1, cfg["ttl"] // 60)
    send = email_ses.send_otp_email(email, code, ttl_minutes)
    if send.get("sent"):
        logger.info("[AUTH] otp_issued  email=%s delivery=ses", email)
        return {"ok": True, "reason": "sent", "ttl_minutes": ttl_minutes, "delivery": "ses"}

    # SES not configured / failed — fall back to dev delivery so the flow stays testable.
    logger.warning("[AUTH] otp_issued  email=%s delivery=dev (ses error: %s)",
                   email, send.get("error"))
    return {
        "ok": True,
        "reason": "sent_dev",
        "ttl_minutes": ttl_minutes,
        "delivery": "dev",
        "dev_code": code,
        "ses_error": send.get("error"),
    }


def verify_otp(email: str, code: str) -> dict:
    """Verify a submitted code. On success returns {ok:True, token}. Else {ok:False, reason}."""
    email = (email or "").strip().lower()
    challenge = _read_json(_challenge_path(email))
    if not challenge:
        return {"ok": False, "reason": "no_challenge"}

    try:
        expires = datetime.fromisoformat(challenge["expires_at"])
    except (KeyError, ValueError):
        expires = _now() - timedelta(seconds=1)
    if _now() > expires:
        _challenge_path(email).unlink(missing_ok=True)
        return {"ok": False, "reason": "expired"}

    if int(challenge.get("attempts", 0)) >= _MAX_ATTEMPTS:
        _challenge_path(email).unlink(missing_ok=True)
        return {"ok": False, "reason": "too_many_attempts"}

    if not secrets.compare_digest(str(code).strip(), str(challenge.get("code"))):
        challenge["attempts"] = int(challenge.get("attempts", 0)) + 1
        _write_json(_challenge_path(email), challenge)
        return {"ok": False, "reason": "wrong_code", "attempts_left": _MAX_ATTEMPTS - challenge["attempts"]}

    _challenge_path(email).unlink(missing_ok=True)
    token = issue_session(email)
    logger.info("[AUTH] verified  email=%s", email)
    return {"ok": True, "token": token, "email": email}


# ── sessions ──────────────────────────────────────────────────────────────────

_SESSION_TTL_SECONDS = 12 * 3600


def issue_session(email: str) -> str:
    token = secrets.token_urlsafe(32)
    _write_json(_session_path(token), {
        "email": email,
        "created_at": _now().isoformat(),
        "expires_at": (_now() + timedelta(seconds=_SESSION_TTL_SECONDS)).isoformat(),
    })
    return token


def check_session(token: str | None) -> dict | None:
    """Return the session dict for a valid, unexpired token, else None."""
    if not token:
        return None
    data = _read_json(_session_path(token))
    if not data:
        return None
    try:
        if _now() > datetime.fromisoformat(data["expires_at"]):
            _session_path(token).unlink(missing_ok=True)
            return None
    except (KeyError, ValueError):
        return None
    return data
