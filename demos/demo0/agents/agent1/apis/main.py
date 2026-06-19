"""
Calvin — Claims Processing FastAPI application entry point.

Run from the repo root:
  uvicorn agents.agent1.apis.main:app --host 0.0.0.0 --port 8011 --reload
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

# Ensure repo root is on the path before any local imports
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from commons.logger import setup_logging
from .routes import router

setup_logging()

_meta = yaml.safe_load(
    (Path(__file__).parent.parent / "metadata.yaml").read_text(encoding="utf-8")
)
_PLATFORM_ORIGIN = "http://localhost:8001"
_OWN_FRONTEND = f"http://localhost:{_meta['frontend_port']}"

app = FastAPI(
    title="Calvin — ABC Insurance Claims API",
    version=_meta.get("api_version", "2.0.0"),
    description="Calvin: multi-agent claims processing (Strands Agents-as-Tools pattern).",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_PLATFORM_ORIGIN, _OWN_FRONTEND,
                   _PLATFORM_ORIGIN.replace("localhost", "127.0.0.1"),
                   _OWN_FRONTEND.replace("localhost", "127.0.0.1")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn

    port = _meta.get("api_port", 8011)
    uvicorn.run("agents.agent1.apis.main:app", host="0.0.0.0", port=port, reload=True)
