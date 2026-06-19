"""
Scans agents/*/metadata.yaml and probes each agent's /ping endpoint
to determine live_status.  Also validates that no two agents share a port.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path
from typing import Any

import yaml

from app.config import get_settings
from app.schemas.agent import AgentDetail, AgentSummary

_PING_TIMEOUT_SECS = 2


def _probe_ping(port: int) -> str:
    """Return 'online', 'offline', or 'unknown'."""
    try:
        with urllib.request.urlopen(
            f"http://localhost:{port}/ping", timeout=_PING_TIMEOUT_SECS
        ):
            return "online"
    except Exception:
        return "offline"


def _load_metadata(agent_dir: Path) -> dict[str, Any] | None:
    meta_file = agent_dir / "metadata.yaml"
    if not meta_file.exists():
        return None
    try:
        return yaml.safe_load(meta_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def validate_port_conflicts(agents: list[AgentSummary]) -> list[str]:
    """Return a list of human-readable conflict messages (empty = no conflicts)."""
    seen: dict[int, str] = {}
    conflicts: list[str] = []
    for agent in agents:
        for label, port in [
            ("api_port", agent.api_port),
            ("frontend_port", agent.frontend_port),
        ]:
            if port in seen:
                conflicts.append(
                    f"Port {port} conflict: {agent.id} ({label}) vs {seen[port]}"
                )
            else:
                seen[port] = f"{agent.id} ({label})"
    return conflicts


def scan_agents(probe_live: bool = True) -> list[AgentSummary]:
    """Return all non-template agents found in agents/ with optional live probing."""
    settings = get_settings()
    agents: list[AgentSummary] = []

    for agent_dir in sorted(settings.agents_dir.iterdir()):
        if not agent_dir.is_dir():
            continue
        if agent_dir.name.startswith("_") or agent_dir.name == "__pycache__":
            continue

        meta = _load_metadata(agent_dir)
        if meta is None:
            continue
        if meta.get("status") == "template":
            continue

        live_status = _probe_ping(meta["api_port"]) if probe_live else "unknown"

        agents.append(AgentSummary(
            id=agent_dir.name,
            name=meta["name"],
            description=meta.get("description", "").strip(),
            use_case=meta.get("use_case", ""),
            domain=meta.get("domain", ""),
            api_port=meta["api_port"],
            frontend_port=meta["frontend_port"],
            status=meta.get("status", "stub"),
            version=meta.get("version", "0.0.0"),
            template_version=meta.get("template_version"),
            live_status=live_status,
        ))

    return agents


def get_agent_detail(agent_id: str, probe_live: bool = True) -> AgentDetail | None:
    settings = get_settings()
    agent_dir = settings.agents_dir / agent_id
    meta = _load_metadata(agent_dir)
    if meta is None or meta.get("status") == "template":
        return None

    live_status = _probe_ping(meta["api_port"]) if probe_live else "unknown"

    return AgentDetail(
        id=agent_id,
        name=meta["name"],
        description=meta.get("description", "").strip(),
        use_case=meta.get("use_case", ""),
        domain=meta.get("domain", ""),
        api_port=meta["api_port"],
        frontend_port=meta["frontend_port"],
        status=meta.get("status", "stub"),
        version=meta.get("version", "0.0.0"),
        template_version=meta.get("template_version"),
        live_status=live_status,
        entry_point=meta.get("entry_point", ""),
        api_version=meta.get("api_version", ""),
    )
