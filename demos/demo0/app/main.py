"""
Neural AI Agents — Platform Backend (:5001)

Run from repo root:
    uvicorn app.main:app --host 0.0.0.0 --port 5001 --reload

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
from app.routers import agents, auth, config, health
from app.services.agent_scanner import scan_agents, validate_port_conflicts

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
app.include_router(auth.router)


@app.on_event("startup")
async def _startup() -> None:
    found = scan_agents(probe_live=False)
    conflicts = validate_port_conflicts(found)
    if conflicts:
        for msg in conflicts:
            _log.warning("PORT CONFLICT: %s", msg)
    else:
        _log.info("Platform started — %d agent(s) discovered, no port conflicts", len(found))
