"""Communication tools — demo mode writes email to .md file."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from strands import tool

_CLAIMS_BASE = Path(__file__).parent.parent.parent  # agents/agent1/
_EMAILS_DIR = _CLAIMS_BASE / "data" / "emails"


@tool
def send_email(case_id: str, to_address: str, subject: str, body: str) -> str:
    """
    Send a communication to the claimant.
    DEMO MODE: writes email content to data/emails/{case_id}_email.md.
    The file path is returned and should be stored in the case metadata.
    Real SMTP integration requires only swapping the implementation — tool name/signature unchanged.

    Args:
        case_id:    The case identifier — used as the filename.
        to_address: Recipient email address.
        subject:    Email subject line.
        body:       Full email body text.

    Returns:
        The file path where the email was written, e.g. data/emails/CLM-..._email.md
    """
    _EMAILS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    content = (
        f"# Email Communication — {case_id}\n\n"
        f"**To:** {to_address}  \n"
        f"**Subject:** {subject}  \n"
        f"**Sent at:** {ts}  \n\n"
        f"---\n\n"
        f"{body}\n"
    )
    file_path = _EMAILS_DIR / f"{case_id}_email.md"
    file_path.write_text(content, encoding="utf-8")
    return str(file_path)
