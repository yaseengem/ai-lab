from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.schemas.agent import AgentDetail, AgentSummary
from app.services.agent_scanner import (
    get_agent_detail,
    scan_agent_statuses,
    scan_agents,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentSummary])
def list_agents() -> list[AgentSummary]:
    # Metadata only — fast. Live status is fetched separately via /status so the
    # marketplace can render cards immediately instead of waiting on health pings.
    return scan_agents(probe_live=False)


@router.get("/status", response_model=dict[str, str])
def list_agent_statuses() -> dict[str, str]:
    # Parallel live probe of every agent's /ping. Returns {agent_id: live_status}.
    return scan_agent_statuses()


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(agent_id: str) -> AgentDetail:
    detail = get_agent_detail(agent_id, probe_live=True)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return detail
