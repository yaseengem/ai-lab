from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.common import ConfigResponse, PortRangeResponse, PortsResponse

router = APIRouter(prefix="/api/config", tags=["config"])


@router.get("", response_model=ConfigResponse)
def get_config() -> ConfigResponse:
    s = get_settings()
    return ConfigResponse(
        app_name=s.app.name,
        description=s.app.description,
        ports=PortsResponse(
            platform_frontend=s.ports.platform_frontend,
            platform_backend=s.ports.platform_backend,
            agent_frontend=PortRangeResponse(**s.ports.agent_frontend.model_dump()),
            agent_backend=PortRangeResponse(**s.ports.agent_backend.model_dump()),
        ),
    )
