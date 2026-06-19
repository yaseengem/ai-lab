from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class AgentSummary(BaseModel):
    id: str
    name: str
    description: str
    use_case: str
    domain: str
    api_port: int
    frontend_port: int
    status: Literal["active", "stub", "template"]
    version: str
    # Records which demox_vN_M template version this agent inherits from.
    # Optional so legacy agents without the field don't 500.
    template_version: Optional[str] = None
    live_status: Literal["online", "offline", "unknown"]


class AgentDetail(AgentSummary):
    entry_point: str
    api_version: str
