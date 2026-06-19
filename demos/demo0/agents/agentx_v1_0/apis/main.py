"""
DemoX — FastAPI application entry point.
Copy this file to your agent folder and update the title/description.

Run from repo root:
  uvicorn agents.demox_v1_0.apis.main:app --host 0.0.0.0 --port 3099 --reload
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

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

# Allow requests from the platform UI and this agent's own frontend
_PLATFORM_ORIGIN = "http://localhost:5000"
_OWN_FRONTEND = f"http://localhost:{_meta['frontend_port']}"

app = FastAPI(
    title=f"{_meta['name']} API",
    version=_meta.get("api_version", "1.0.0"),
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

app.include_router(router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("agents.demox_v1_0.apis.main:app", host="0.0.0.0",
                port=_meta.get("api_port", 3099), reload=True)
