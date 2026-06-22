"""
AI Agents Squad — Platform Backend (:8002)

Run from demos/demo0:
    uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload

Extension pattern:
    new feature = routers/{domain}.py + services/{domain}_service.py
    then app.include_router(...) below.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from commons.logger import setup_logging
from app.config import get_settings
from app.routers import agent_config, agents, config, health
from app.services.agent_scanner import (
    collect_metadata_warnings,
    scan_agents,
    validate_port_conflicts,
)

setup_logging()
_log = logging.getLogger(__name__)

settings = get_settings()

app = FastAPI(
    title=settings.app.name,
    description=settings.app.description,
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{settings.ports.platform_frontend}",
        f"http://127.0.0.1:{settings.ports.platform_frontend}",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router)
app.include_router(health.router)
app.include_router(config.router)
app.include_router(agent_config.router)


@app.on_event("startup")
async def _startup() -> None:
    found = scan_agents(probe_live=False)
    conflicts = validate_port_conflicts(found)
    if conflicts:
        for msg in conflicts:
            _log.warning("PORT CONFLICT: %s", msg)
    else:
        _log.info("Platform started — %d agent(s) discovered, no port conflicts", len(found))

    # Soft metadata-standards check — log warnings, never hard-fail startup.
    meta_warnings = collect_metadata_warnings()
    for agent_id, warnings in meta_warnings.items():
        for msg in warnings:
            _log.warning("METADATA STANDARD: %s — %s", agent_id, msg)
