"""
Per-agent config + restart API.

  GET  /api/agents/{agent_id}/config   -> the agent's agent.config.yaml as JSON
  PUT  /api/agents/{agent_id}/config   -> overwrite it (must contain a personas list)
  POST /api/agents/{agent_id}/restart  -> restart (or start) the agent process

Config read/write goes straight to disk, so it works even when the agent is offline.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

from app.services.agent_config_service import (
    read_config,
    restart_agent,
    write_config,
)

router = APIRouter(prefix="/api/agents", tags=["agent-config"])


@router.get("/{agent_id}/config")
def get_agent_config(agent_id: str) -> dict:
    config = read_config(agent_id)
    if config is None:
        raise HTTPException(
            status_code=404, detail=f"No config found for agent '{agent_id}'"
        )
    return config


@router.put("/{agent_id}/config")
def put_agent_config(agent_id: str, body: dict[str, Any] = Body(...)) -> dict:
    try:
        write_config(agent_id, body)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "saved"}


@router.post("/{agent_id}/restart")
def post_agent_restart(agent_id: str) -> dict:
    try:
        return restart_agent(agent_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # network error talking to a live agent, etc.
        raise HTTPException(
            status_code=502, detail=f"restart failed: {exc}"
        ) from exc
