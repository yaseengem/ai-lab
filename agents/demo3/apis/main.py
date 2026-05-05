"""
Loan Processing FastAPI stub — placeholder until EP-5 is implemented.

Responds to all Neural API endpoints with 501 Not Implemented,
except GET /ping which returns a health-check so the frontend and
start.sh can confirm the process is up.

Run from the agents/loan/apis/ directory:
  uvicorn main:app --host 0.0.0.0 --port 8003
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(
    title="Neural Loan Processing API (stub)",
    version="0.0.0",
    description="Loan Processing agent stub — not yet implemented.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STUB_MSG = "Loan Processing agent is not yet implemented. Coming in a future iteration."


@app.get("/ping")
def ping():
    return {"status": "ok", "agent": "loan", "note": STUB_MSG}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def stub_catch_all(path: str, request: Request):  # noqa: ARG001
    return JSONResponse(
        status_code=501,
        content={"detail": STUB_MSG, "agent": "loan"},
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("LOAN_API_PORT", "8003"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
