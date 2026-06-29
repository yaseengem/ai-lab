"""
DemoX v2.0 — FastAPI application entry point.

Copy this file to your agent folder; the title/version/description come from
metadata.yaml automatically (no edits needed).

Run from repo root:
  uvicorn agents.agentx_v2_0.apis.main:app --host 0.0.0.0 --port 3098 --reload
"""

from __future__ import annotations

import logging
import os
import sys

import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from commons.logger import setup_logging, get_logger

from agents.agentx_v2_0.agentic.paths import AGENT_DIR as _AGENT_DIR, LOGS_DIR as _LOGS_DIR, ensure_state_dirs

from .routes import router, service
from . import test_routes

setup_logging()

# Scaffold the state/ tree (logs, memory, sessions, …) before anything writes to it.
ensure_state_dirs()

# Also write logs to this agent's own state/logs/ dir (never a shared/root folder).
_file_handler = logging.FileHandler(_LOGS_DIR / "agent.log", encoding="utf-8")
_file_handler.setFormatter(logging.Formatter(
    "%(asctime)s.%(msecs)03d [%(levelname)-5s] %(name)s - %(message)s", datefmt="%H:%M:%S"))
logging.getLogger().addHandler(_file_handler)

logger = get_logger(__name__)

_meta = yaml.safe_load((_AGENT_DIR / "metadata.yaml").read_text(encoding="utf-8"))

# Allow requests from the platform UI and this agent's own frontend.
_PLATFORM_ORIGIN = "http://localhost:8001"
_OWN_FRONTEND = f"http://localhost:{_meta['frontend_port']}"

app = FastAPI(
    title=f"{_meta['name']} API",
    version=_meta.get("api_version", "2.0.0"),
    description=_meta.get("description", ""),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        _PLATFORM_ORIGIN,
        _OWN_FRONTEND,
        _PLATFORM_ORIGIN.replace("localhost", "127.0.0.1"),
        _OWN_FRONTEND.replace("localhost", "127.0.0.1"),
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire the test router to the same service instance the main routes use.
test_routes.init_service(service)

app.include_router(router)
app.include_router(test_routes.router)


@app.on_event("startup")
async def _on_startup() -> None:
    """Run the startup self-check and reconcile runs left non-terminal by a stop/crash."""
    check = service.self_check()
    if check["status"] == "ok":
        logger.info("[STARTUP] self_check=ok")
    elif check["status"] == "awaiting_setup":
        logger.warning("[STARTUP] self_check=awaiting_setup  "
                       "no state/config/setup.yaml — configure from the marketplace")
    else:
        reasons = [f"{c['name']}: {c['detail']}" for c in check["checks"] if not c["ok"]]
        logger.warning("[STARTUP] self_check=degraded  reasons=%s", "; ".join(reasons))

    recovery = await service.recover_on_startup()
    logger.info("[STARTUP] recovery  resumed=%d interrupted=%d",
                recovery["resumed"], recovery["interrupted"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.agentx_v2_0.apis.main:app", host="0.0.0.0",
                port=_meta.get("api_port", 3098), reload=True)
