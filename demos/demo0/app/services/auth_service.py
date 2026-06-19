from __future__ import annotations

import os
import secrets
from dataclasses import dataclass

_sessions: dict[str, str] = {}  # token -> username


@dataclass
class LoginResult:
    token: str
    username: str


def login(username: str, password: str) -> LoginResult | None:
    expected_user = os.getenv("AUTH_USERNAME", "")
    expected_pass = os.getenv("AUTH_PASSWORD", "")
    if not expected_user or not expected_pass:
        return None
    if username != expected_user or password != expected_pass:
        return None
    token = secrets.token_urlsafe(32)
    _sessions[token] = username
    return LoginResult(token=token, username=username)
