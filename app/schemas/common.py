from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    timestamp: datetime
    agents_found: int


class PortRangeResponse(BaseModel):
    start: int
    end: int


class PortsResponse(BaseModel):
    platform_frontend: int
    platform_backend: int
    agent_frontend: PortRangeResponse
    agent_backend: PortRangeResponse


class ConfigResponse(BaseModel):
    app_name: str
    description: str
    ports: PortsResponse
