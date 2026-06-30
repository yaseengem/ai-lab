"""
Test runner routes — scenario-based self-test/demo harness.

Loads JSON scenario INPUTS from the git-tracked test/test_scenarios/ folder, runs
the real pipeline for a chosen scenario, evaluates its `expected` block, and emits
a `test-result` event with pass/fail. Scenario artifacts land in state/ like any
real run.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException

from commons.logger import get_logger

from agents.agent5.agentic.paths import TEST_SCENARIOS_DIR as _SCENARIOS_DIR

from .service import Service

logger = get_logger(__name__)

router = APIRouter(prefix="/test")

# Shared service instance — wired from apis.main at startup so the Test Runner
# and the main routes operate on the same in-memory state.
_service: Service | None = None


def init_service(service: Service) -> None:
    global _service
    _service = service


def _load_scenarios() -> list[dict]:
    scenarios = []
    if not _SCENARIOS_DIR.exists():
        return scenarios
    for path in sorted(_SCENARIOS_DIR.glob("*.json")):
        try:
            scenarios.append(json.loads(path.read_text(encoding="utf-8")))
        except Exception as e:
            logger.warning("[TEST] failed to load scenario %s: %s", path.name, e)
    return scenarios


@router.get("/scenarios")
def list_scenarios():
    """List all available test scenarios with metadata and expected results."""
    scenarios = _load_scenarios()
    return {
        "scenarios": [
            {
                "id": s.get("id"),
                "name": s.get("name"),
                "description": s.get("description", ""),
                "tags": s.get("tags", []),
                "expected": s.get("expected", {}),
            }
            for s in scenarios
        ],
        "count": len(scenarios),
    }


@router.get("/scenarios/{scenario_id}/data")
def get_scenario_data(scenario_id: str):
    """Return the full scenario JSON (payload + expected block)."""
    scenarios = _load_scenarios()
    scenario = next((s for s in scenarios if s.get("id") == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")
    return scenario


def _evaluate(expected: dict, meta: dict, events: list[dict]) -> dict:
    """Check a scenario's expected assertions against the finished run."""
    assertions: list[dict] = []

    if "status" in expected:
        actual = meta.get("status")
        assertions.append({
            "name": "status", "expected": expected["status"], "actual": actual,
            "ok": actual == expected["status"],
        })

    if "outcome" in expected:
        actual = meta.get("outcome")
        assertions.append({
            "name": "outcome", "expected": expected["outcome"], "actual": actual,
            "ok": actual == expected["outcome"],
        })

    if "min_events" in expected:
        actual = len(events)
        assertions.append({
            "name": "min_events", "expected": expected["min_events"], "actual": actual,
            "ok": actual >= int(expected["min_events"]),
        })

    if "must_emit" in expected:
        emitted_types = {e.get("type") for e in events}
        for required in expected["must_emit"]:
            assertions.append({
                "name": f"must_emit:{required}", "expected": required,
                "actual": required in emitted_types, "ok": required in emitted_types,
            })

    passed = all(a["ok"] for a in assertions) if assertions else True
    return {"passed": passed, "assertions": assertions}


@router.post("/run/{scenario_id}")
async def run_scenario(scenario_id: str):
    """
    Load a scenario, run the real pipeline with it, evaluate `expected`, and emit
    a `test-result` event. Returns {session_id, run_id, scenario_id} immediately;
    connect to GET /monitor/{session_id} for the live stream.
    """
    if _service is None:
        raise HTTPException(status_code=500, detail="Service not initialised")

    scenarios = _load_scenarios()
    scenario = next((s for s in scenarios if s.get("id") == scenario_id), None)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")

    meta = _service.create_session(persona="admin", trigger_mode="test", scenario_id=scenario_id)
    session_id = meta["session_id"]
    _service.update_session(session_id, scenario_name=scenario.get("name"))

    expected = scenario.get("expected", {})
    # Scenarios drive the HITL gate without a human: "approve" (default) or "reject".
    auto_decision = str(scenario.get("auto_decision", "approve")).lower()

    async def _auto_resolve_gate():
        """
        Drive the HITL gate so test runs don't block on the 20-min timeout.
        Polls for awaiting_approval, then resolves with the scenario's decision.
        """
        for _ in range(200):  # ~10s max at 50ms intervals
            await asyncio.sleep(0.05)
            meta_now = _service.get_session(session_id) or {}
            if meta_now.get("status") == "awaiting_approval":
                _service.resolve_approval(session_id, auto_decision)
                return
            if meta_now.get("status") in ("complete", "failed", "interrupted"):
                return

    async def _run_and_evaluate():
        gate_task = asyncio.create_task(_auto_resolve_gate())
        await _service.run_pipeline(session_id)
        gate_task.cancel()
        final_meta = _service.get_session(session_id) or {}
        events = _service.get_event_log(session_id)
        result = _evaluate(expected, final_meta, events)
        await _service.emit(session_id, {
            "type": "test-result",
            "scenario_id": scenario_id,
            "passed": result["passed"],
            "assertions": result["assertions"],
        })
        logger.info("[TEST] scenario_complete  scenario=%s session_id=%s passed=%s",
                    scenario_id, session_id, result["passed"])

    asyncio.create_task(_run_and_evaluate())
    logger.info("[TEST] scenario_run_started  scenario=%s session_id=%s", scenario_id, session_id)

    return {
        "session_id": session_id,
        "run_id": meta["run_id"],
        "scenario_id": scenario_id,
        "scenario_name": scenario.get("name"),
        "expected": expected,
        "status": "queued",
    }
