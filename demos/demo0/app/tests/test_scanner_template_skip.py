"""
Regression test: the platform scanner skips agents on `status: template`,
NOT on folder name. We rename the template folder over time (demox_v1_0 today,
demox_v2_0 tomorrow) and a brittle name check would silently start running it.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.config import get_settings
from app.services import agent_scanner


def _write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data), encoding="utf-8")


@pytest.fixture
def isolated_agents_dir(tmp_path, monkeypatch):
    """Point the scanner at a temp agents/ dir with a few synthetic agents."""
    settings = get_settings()
    monkeypatch.setattr(settings, "agents_dir", tmp_path)
    yield tmp_path


def test_scanner_skips_template_regardless_of_folder_name(isolated_agents_dir, monkeypatch):
    # Don't actually try to ping anything during the test.
    monkeypatch.setattr(agent_scanner, "_probe_ping", lambda _: "unknown")

    # Real (non-template) agent
    _write(isolated_agents_dir / "demoA" / "metadata.yaml", {
        "name": "Real", "description": "x", "use_case": "u", "domain": "d",
        "api_port": 3001, "frontend_port": 8001, "entry_point": "x",
        "api_version": "1", "status": "active", "version": "1.0.0",
        "template_version": "1.0",
    })
    # Template at the conventional name
    _write(isolated_agents_dir / "demox_v1_0" / "metadata.yaml", {
        "name": "Template1", "description": "x", "use_case": "t", "domain": "t",
        "api_port": 3098, "frontend_port": 8098, "entry_point": "x",
        "api_version": "1", "status": "template", "version": "0.1.0",
        "template_version": "1.0",
    })
    # Template at a future versioned folder — should ALSO be skipped.
    _write(isolated_agents_dir / "demox_v9_9" / "metadata.yaml", {
        "name": "TemplateFuture", "description": "x", "use_case": "t", "domain": "t",
        "api_port": 3099, "frontend_port": 8099, "entry_point": "x",
        "api_version": "1", "status": "template", "version": "0.1.0",
        "template_version": "9.9",
    })
    # Template at a totally non-conventional folder name — must still skip.
    _write(isolated_agents_dir / "some_random_name" / "metadata.yaml", {
        "name": "TemplateOther", "description": "x", "use_case": "t", "domain": "t",
        "api_port": 3097, "frontend_port": 8097, "entry_point": "x",
        "api_version": "1", "status": "template", "version": "0.1.0",
    })

    found = agent_scanner.scan_agents(probe_live=False)
    ids = sorted(a.id for a in found)
    assert ids == ["demoA"], f"expected only demoA to be returned, got {ids}"


def test_template_version_surfaces_through_to_summary(isolated_agents_dir, monkeypatch):
    monkeypatch.setattr(agent_scanner, "_probe_ping", lambda _: "unknown")
    _write(isolated_agents_dir / "demoA" / "metadata.yaml", {
        "name": "Real", "description": "x", "use_case": "u", "domain": "d",
        "api_port": 3001, "frontend_port": 8001, "entry_point": "x",
        "api_version": "1", "status": "active", "version": "1.0.0",
        "template_version": "1.0",
    })
    _write(isolated_agents_dir / "demoB" / "metadata.yaml", {
        # No template_version — legacy agent should not 500
        "name": "Legacy", "description": "x", "use_case": "u", "domain": "d",
        "api_port": 3002, "frontend_port": 8002, "entry_point": "x",
        "api_version": "1", "status": "stub", "version": "0.1.0",
    })

    found = {a.id: a for a in agent_scanner.scan_agents(probe_live=False)}
    assert found["demoA"].template_version == "1.0"
    assert found["demoB"].template_version is None
