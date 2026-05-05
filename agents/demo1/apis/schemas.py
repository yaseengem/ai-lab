"""Pydantic v2 request/response schemas for the Calvin Claims API."""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """Body for POST /chat/{session_id} — send a message to Calvin."""

    message: str
    role: Literal["end_user", "support_exec", "admin"] = "end_user"
    user_id: str = "anonymous"
    file_ref: Optional[str] = None  # set after POST /upload


class FileUploadResponse(BaseModel):
    """Response from POST /upload."""

    file_ref: str      # "{case_id}/{filename}" — pass to Calvin in chat
    case_id: str
    session_id: str


class SessionSummary(BaseModel):
    """Lightweight session record returned by GET /sessions."""

    session_id: str
    case_id: str
    status: str
    role: str
    user_id: str
    created_at: str
    updated_at: str


class ApproveRequest(BaseModel):
    """Body for POST /approve/{case_id} — human approval shortcut."""

    approver_id: str
    notes: Optional[str] = ""
    override_decision: Optional[str] = None
    override_amount: Optional[str] = None


class RejectRequest(BaseModel):
    """Body for POST /reject/{case_id} — human rejection shortcut."""

    approver_id: str
    reason: str
