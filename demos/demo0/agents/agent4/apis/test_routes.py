"""Test runner routes — scenario-based pipeline testing."""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from .service import PipelineService
from .agent_bridge import run_pipeline
from agents.agent4.agentic.tools.mock_data import set_session_scenario

from commons.logger import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/test")

# Shared service instance — same as main routes
_service: PipelineService | None = None

_SCENARIOS_DIR = Path(__file__).parent.parent / "data" / "test_scenarios"


def init_service(service: PipelineService) -> None:
    global _service
    _service = service


def _load_scenarios() -> list[dict]:
    scenarios = []
    if not _SCENARIOS_DIR.exists():
        return scenarios
    for path in sorted(_SCENARIOS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            scenarios.append(data)
        except Exception as e:
            logger.warning("[TEST] failed to load scenario %s: %s", path.name, e)
    return scenarios


@router.get("/scenarios/{scenario_id}/data")
def get_scenario_data(scenario_id: str):
    """Return the full test scenario JSON including trades, counterparties, and market context."""
    scenarios = _load_scenarios()
    scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")
    return scenario


@router.get("/scenarios")
def list_scenarios():
    """List all available test scenarios with metadata and expected results."""
    scenarios = _load_scenarios()
    return {
        "scenarios": [
            {
                "id": s["id"],
                "name": s["name"],
                "description": s["description"],
                "tags": s.get("tags", []),
                "expected": s.get("expected", {}),
            }
            for s in scenarios
        ],
        "count": len(scenarios),
    }


@router.post("/run/{scenario_id}")
async def run_scenario(scenario_id: str):
    """
    Load a test scenario and start the pipeline with its data overrides.

    Returns session_id to connect to GET /monitor/{session_id} for the SSE stream.
    The scenario's trade and counterparty data replace the default mock dataset
    for this specific pipeline run.
    """
    if _service is None:
        raise HTTPException(status_code=500, detail="Service not initialised")

    scenarios = _load_scenarios()
    scenario = next((s for s in scenarios if s["id"] == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    meta = _service.create_session(trigger_mode="test", upload_id=None)
    session_id = meta["session_id"]

    # Store scenario identity on the session so it shows in history
    _service.update_session(session_id, scenario_id=scenario_id, scenario_name=scenario["name"])

    # Register scenario data so mock tools pick it up via threading.local
    set_session_scenario(session_id, scenario)

    trigger_input = {
        "mode": "test",
        "scenario_id": scenario_id,
        "scenario_name": scenario["name"],
        "use_mock": True,
    }

    asyncio.create_task(run_pipeline(session_id, trigger_input, _service))
    logger.info("[TEST] scenario_run_started  scenario=%s session_id=%s", scenario_id, session_id)

    return {
        "session_id": session_id,
        "scenario_id": scenario_id,
        "scenario_name": scenario["name"],
        "expected": scenario.get("expected", {}),
        "status": "running",
        "created_at": meta["created_at"],
    }
