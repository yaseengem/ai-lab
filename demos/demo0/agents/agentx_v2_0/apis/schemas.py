"""Pydantic request/response models for the v2.0 template API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Body for POST /chat/{session_id}."""
    message: str
    persona: str = "end_user"
    user_id: Optional[str] = None


class RunRequest(BaseModel):
    """Body for POST /run."""
    persona: str = "end_user"
    scenario_id: Optional[str] = None
    payload: Optional[dict[str, Any]] = None


# ── Responses ─────────────────────────────────────────────────────────────────

class CheckResult(BaseModel):
    name: str
    ok: bool
    detail: str = ""


class PingResponse(BaseModel):
    status: str                       # "ok" | "degraded"
    agent: str
    version: str
    checks: list[CheckResult] = Field(default_factory=list)


class RunResponse(BaseModel):
    session_id: str
    run_id: str
    status: str                       # "queued"


class ApprovalResponse(BaseModel):
    status: str                       # "approved" | "rejected" | "approvals-disabled"


class MemoryResponse(BaseModel):
    memory: dict[str, Any] = Field(default_factory=dict)


class ArchitectureResponse(BaseModel):
    markdown: str


class PersonasResponse(BaseModel):
    personas: list[dict[str, Any]] = Field(default_factory=list)
