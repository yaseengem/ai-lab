"""
Scans agents/*/metadata.yaml and probes each agent's /ping endpoint
to determine live_status.  Also validates that no two agents share a port.
"""

from __future__ import annotations

import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import yaml

from app.config import get_settings
from app.schemas.agent import AgentDetail, AgentSummary

_PING_TIMEOUT_SECS = 2
_MAX_PROBE_WORKERS = 16
_CARD_DESCRIPTION_MAX = 140
# Lenient semver shape: MAJOR.MINOR.PATCH with optional pre-release/build suffix.
_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+(?:[-+].+)?$")


def _probe_ping(port: int) -> str:
    """Return 'online' or 'offline'.

    Uses 127.0.0.1 rather than 'localhost' on purpose: on Windows 'localhost'
    resolves to both IPv4 and IPv6, so a closed port is probed twice (~2x the
    timeout) before failing. Pinning to IPv4 keeps an offline probe bounded by
    a single _PING_TIMEOUT_SECS.
    """
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/ping", timeout=_PING_TIMEOUT_SECS
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


def validate_metadata_standards(meta: dict[str, Any]) -> list[str]:
    """Return a list of soft-warning messages for a single agent's metadata.

    These are *standards* checks (not hard schema validation): the platform should
    keep working even when an agent is non-conforming, so callers log these rather
    than reject the agent. Checks:
      - card_description missing, or longer than 140 chars
      - icon missing
      - version not semver-shaped (MAJOR.MINOR.PATCH)
    """
    warnings: list[str] = []

    card = (meta.get("card_description") or "").strip()
    if not card:
        warnings.append("card_description missing")
    elif len(card) > _CARD_DESCRIPTION_MAX:
        warnings.append(
            f"card_description too long ({len(card)} > {_CARD_DESCRIPTION_MAX} chars)"
        )

    if not (meta.get("icon") or "").strip():
        warnings.append("icon missing")

    version = (meta.get("version") or "").strip()
    if not _SEMVER_RE.match(version):
        warnings.append(f"version not semver-shaped: {version!r}")

    return warnings


def collect_metadata_warnings() -> dict[str, list[str]]:
    """Run validate_metadata_standards over every non-template agent on disk.

    Returns {agent_id: [warning, ...]} only for agents that have at least one
    warning. Used at startup to surface non-conforming metadata without failing.
    """
    settings = get_settings()
    result: dict[str, list[str]] = {}
    for agent_id, meta in _iter_agent_metadata(settings):
        warnings = validate_metadata_standards(meta)
        if warnings:
            result[agent_id] = warnings
    return result


def _iter_agent_metadata(settings) -> list[tuple[str, dict[str, Any]]]:
    """Return (agent_id, metadata) for every non-template agent on disk."""
    result: list[tuple[str, dict[str, Any]]] = []
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

        result.append((agent_dir.name, meta))
    return result


def scan_agents(probe_live: bool = True) -> list[AgentSummary]:
    """Return all non-template agents found in agents/ with optional live probing.

    Live probing is intentionally OFF by default for list endpoints: pinging each
    agent serially blocks the response (2s timeout per offline agent). Callers that
    want live status should leave probe_live=False here and use scan_agent_statuses()
    (probes in parallel) instead, so metadata renders immediately.
    """
    settings = get_settings()
    entries = _iter_agent_metadata(settings)

    statuses = scan_agent_statuses() if probe_live else {}

    return [
        AgentSummary(
            id=agent_id,
            name=meta["name"],
            description=meta.get("description", "").strip(),
            card_description=(meta.get("card_description") or "").strip() or None,
            icon=(meta.get("icon") or "").strip() or None,
            use_case=meta.get("use_case", ""),
            domain=meta.get("domain", ""),
            api_port=meta["api_port"],
            frontend_port=meta["frontend_port"],
            status=meta.get("status", "stub"),
            version=meta.get("version", "0.0.0"),
            template_version=meta.get("template_version"),
            live_status=statuses.get(agent_id, "unknown"),
        )
        for agent_id, meta in entries
    ]


def scan_agent_statuses() -> dict[str, str]:
    """Probe every non-template agent's /ping endpoint in parallel.

    Returns {agent_id: 'online' | 'offline'}. Parallel probing keeps the call
    bounded by the slowest single ping (~timeout) rather than the sum of all pings.
    """
    settings = get_settings()
    entries = _iter_agent_metadata(settings)
    if not entries:
        return {}

    with ThreadPoolExecutor(max_workers=_MAX_PROBE_WORKERS) as pool:
        statuses = pool.map(lambda e: _probe_ping(e[1]["api_port"]), entries)
        return {agent_id: status for (agent_id, _), status in zip(entries, statuses)}


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
        card_description=(meta.get("card_description") or "").strip() or None,
        icon=(meta.get("icon") or "").strip() or None,
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
