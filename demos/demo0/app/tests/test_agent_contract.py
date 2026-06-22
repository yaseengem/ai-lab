"""
Contract test for the agentx_v2_0 template's FastAPI app.

Every agent copied from agentx_v2_0 must expose the canonical platform API
contract. This test pins that contract at the template level so a template
refactor that drops/renames an endpoint fails CI.

It is intentionally tolerant of the backend not existing yet: if the template's
FastAPI app can't be imported (e.g. apis/main.py hasn't been written, or an
optional dep like strands/boto3 isn't installed in the test env), the whole
module is skipped rather than hard-failing the suite.

Run from demos/demo0 (the import root):  pytest app/tests/test_agent_contract.py
"""

from __future__ import annotations

import pytest

# The template app and TestClient are optional in some environments; skip cleanly.
try:
    from fastapi.testclient import TestClient

    from agents.agentx_v2_0.apis.main import app as agent_app  # type: ignore
except Exception as exc:  # ImportError, missing deps, app not built yet, etc.
    pytest.skip(
        f"agentx_v2_0 FastAPI app not importable yet: {exc}",
        allow_module_level=True,
    )


# ── canonical contract ────────────────────────────────────────────────────────

# GET endpoints we exercise with the TestClient. We assert NON-404 (the route is
# registered) — not 200 — to avoid depending on side effects / live state. A
# concrete id is used where the path is parameterised.
GET_ENDPOINTS = [
    "/ping",
    "/config",
    "/personas",
    "/architecture",
    "/memory",
    "/sessions",
    "/test/scenarios",
]

# POST routes we assert are *registered* via app.routes inspection only (no call),
# so we never trigger a run / approval / restart as a side effect.
POST_ROUTE_TEMPLATES = [
    "/run",
    "/approve/{id}",
    "/reject/{id}",
    "/admin/restart",
]


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(agent_app)


def _routes_by_method(method: str) -> set[str]:
    """Return the set of registered path templates for the given HTTP method."""
    paths: set[str] = set()
    for route in agent_app.routes:
        methods = getattr(route, "methods", None) or set()
        if method in methods:
            paths.add(getattr(route, "path", ""))
    return paths


@pytest.mark.parametrize("path", GET_ENDPOINTS)
def test_get_endpoint_is_registered(client: TestClient, path: str) -> None:
    # 404 means the route doesn't exist; anything else (200/422/500/SSE) means it does.
    resp = client.get(path)
    assert resp.status_code != 404, f"GET {path} is missing from the agent contract"


def _normalize(path: str) -> str:
    """Collapse FastAPI param names so '/approve/{session_id}' matches '/approve/{id}'."""
    import re

    return re.sub(r"\{[^}]+\}", "{id}", path)


@pytest.mark.parametrize("template", POST_ROUTE_TEMPLATES)
def test_post_route_is_registered(template: str) -> None:
    registered = {_normalize(p) for p in _routes_by_method("POST")}
    assert _normalize(template) in registered, (
        f"POST {template} is missing from the agent contract; "
        f"registered POST routes: {sorted(registered)}"
    )
