"""Route handlers — add your endpoints here."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
def ping():
    """Health-check endpoint — required by the platform scanner."""
    return {"status": "ok", "agent": "demox_v1_0"}
