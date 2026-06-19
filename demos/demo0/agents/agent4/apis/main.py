"""
Settlement Failure Prevention Agent — FastAPI application entry point.

Run from the repo root:
  uvicorn agents.demo4.apis.main:app --host 0.0.0.0 --port 3004 --reload
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

# Load root .env (AWS credentials, OTEL settings, etc.) before importing models
_dotenv_path = os.path.join(_REPO_ROOT, ".env")
if os.path.exists(_dotenv_path):
    try:
        from dotenv import load_dotenv
        load_dotenv(_dotenv_path, override=False)
    except ImportError:
        pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from commons.logger import setup_logging
from .routes import router, service
from .test_routes import router as test_router, init_service as init_test_service

setup_logging()

_meta = yaml.safe_load(
    (Path(__file__).parent.parent / "metadata.yaml").read_text(encoding="utf-8")
)
_PLATFORM_ORIGIN = "http://localhost:5000"
_OWN_FRONTEND = f"http://localhost:{_meta['frontend_port']}"

app = FastAPI(
    title="Settlement Failure Prevention Agent — JSE (UC8)",
    version=_meta.get("api_version", "1.0.0"),
    description=(
        "7-step multi-agent pipeline for JSE settlement failure prediction and prevention. "
        "Monitors T+1/T+2 exposure, classifies risk, executes LOLR and roll interventions, "
        "and produces FSCA-compliant audit reports."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        _PLATFORM_ORIGIN, _OWN_FRONTEND,
        _PLATFORM_ORIGIN.replace("localhost", "127.0.0.1"),
        _OWN_FRONTEND.replace("localhost", "127.0.0.1"),
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(test_router)
init_test_service(service)


@app.on_event("startup")
async def _sweep_stranded_runs_on_startup():
    """
    Mark any run whose status is non-terminal as 'interrupted'. The agent runs
    with a single uvicorn worker, so on startup no other process can own these
    runs — we can claim them safely. Without this, a process restart leaves runs
    visible as 'running' forever.
    """
    swept = service.sweep_stranded_runs()
    if swept:
        # Logged at WARNING by the service itself; nothing more to do here.
        pass


if __name__ == "__main__":
    import uvicorn
    # IMPORTANT: keep workers=1. The HITL approval mechanism uses an in-memory
    # asyncio.Future dict (PipelineService._approval_futures) — cross-worker
    # resume is not implemented.
    uvicorn.run("agents.demo4.apis.main:app", host="0.0.0.0", port=_meta.get("api_port", 3004), reload=True, workers=1)
