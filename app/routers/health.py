from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.common import HealthResponse
from app.services.agent_scanner import scan_agents

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health() -> HealthResponse:
    agents = scan_agents(probe_live=False)
    return HealthResponse(
        status="ok",
        timestamp=datetime.now(tz=timezone.utc),
        agents_found=len(agents),
    )
