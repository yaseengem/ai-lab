"""
Per-agent configuration + lifecycle service.

Reads/writes each agent's `agents/{agent_id}/agent.config.yaml` directly on disk
(so config editing works whether or not the agent process is running), and can
restart an agent — either by hitting its /admin/restart endpoint if it's live,
or by spawning its `main.py` detached if it's offline.

This is platform logic, so it lives in app/services/ (not in any agent folder).
"""

from __future__ import annotations

import logging
import subprocess
import sys
import urllib.request
from pathlib import Path
from typing import Any

import yaml
from filelock import FileLock

from app.config import get_settings

_log = logging.getLogger(__name__)

_PING_TIMEOUT_SECS = 2
_RESTART_POST_TIMEOUT_SECS = 5
_CONFIG_FILENAME = "agent.config.yaml"
_METADATA_FILENAME = "metadata.yaml"
# Operator overrides live under the agent's gitignored state/ tree.
_SETUP_RELPATH = ("state", "config", "setup.yaml")


def _agent_dir(agent_id: str) -> Path:
    return get_settings().agents_dir / agent_id


def _config_path(agent_id: str) -> Path:
    return _agent_dir(agent_id) / _CONFIG_FILENAME


def _setup_path(agent_id: str) -> Path:
    return _agent_dir(agent_id).joinpath(*_SETUP_RELPATH)


def _load_metadata(agent_id: str) -> dict[str, Any] | None:
    meta_file = _agent_dir(agent_id) / _METADATA_FILENAME
    if not meta_file.exists():
        return None
    try:
        return yaml.safe_load(meta_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_config(agent_id: str) -> dict | None:
    """Return the parsed agent.config.yaml as a dict, or None if it doesn't exist.

    None signals a 404 to the caller. Works regardless of whether the agent's
    process is running, because it reads straight from disk.
    """
    path = _config_path(agent_id)
    if not path.exists():
        return None
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    # An empty file parses to None — normalise to an empty dict so callers get an object.
    return raw if isinstance(raw, dict) else {}


def write_config(agent_id: str, data: Any) -> None:
    """Validate and persist agent.config.yaml under a file lock.

    Validation: the payload must be a mapping that is YAML-serialisable and
    contains a `personas` list. Raises ValueError on invalid input. The agent's
    folder must already exist (we don't create new agents here).
    """
    if not isinstance(data, dict):
        raise ValueError("config must be a JSON/YAML object")

    personas = data.get("personas")
    if not isinstance(personas, list):
        raise ValueError("config must contain a 'personas' list")

    agent_dir = _agent_dir(agent_id)
    if not agent_dir.is_dir():
        raise FileNotFoundError(f"agent '{agent_id}' not found")

    try:
        serialized = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    except yaml.YAMLError as exc:  # not YAML-serialisable
        raise ValueError(f"config is not YAML-serializable: {exc}") from exc

    path = _config_path(agent_id)
    lock = FileLock(str(path) + ".lock")
    with lock:
        path.write_text(serialized, encoding="utf-8")
    _log.info("Wrote config for agent %s (%d bytes)", agent_id, len(serialized))


def read_setup(agent_id: str) -> dict:
    """Return the agent's operator overrides (state/config/setup.yaml) as a dict.

    Returns an empty dict when no setup file exists yet (the agent is
    `awaiting_setup`) — distinct from agent.config.yaml, which is the definition.
    """
    if not _agent_dir(agent_id).is_dir():
        raise FileNotFoundError(f"agent '{agent_id}' not found")
    path = _setup_path(agent_id)
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    return raw if isinstance(raw, dict) else {}


def write_setup(agent_id: str, data: Any) -> None:
    """Validate and persist the operator overrides to state/config/setup.yaml.

    The payload is a flat mapping of operator-editable keys (e.g. model_id,
    ses_sender, hitl_approval, integrations). Creates state/config/ if needed so a
    fresh agent can be configured from the marketplace; saving it clears the agent's
    `awaiting_setup` state on its next start/restart.
    """
    if not isinstance(data, dict):
        raise ValueError("setup must be a JSON/YAML object")

    agent_dir = _agent_dir(agent_id)
    if not agent_dir.is_dir():
        raise FileNotFoundError(f"agent '{agent_id}' not found")

    try:
        serialized = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    except yaml.YAMLError as exc:
        raise ValueError(f"setup is not YAML-serializable: {exc}") from exc

    path = _setup_path(agent_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    lock = FileLock(str(path) + ".lock")
    with lock:
        path.write_text(serialized, encoding="utf-8")
    _log.info("Wrote setup for agent %s (%d bytes)", agent_id, len(serialized))


def _ping_online(port: int) -> bool:
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/ping", timeout=_PING_TIMEOUT_SECS
        ):
            return True
    except Exception:
        return False


def restart_agent(agent_id: str) -> dict:
    """Restart an agent.

    If the agent's /ping (api_port from its metadata.yaml) is online, POST to its
    /admin/restart endpoint and report {"status":"restarting","running":true}.
    Otherwise spawn `python agents/{agent_id}/main.py` detached (cwd=demos/demo0)
    and report {"status":"starting","running":false}.

    Raises FileNotFoundError if the agent (or its metadata) doesn't exist.
    """
    meta = _load_metadata(agent_id)
    if meta is None:
        raise FileNotFoundError(f"agent '{agent_id}' not found")

    api_port = meta.get("api_port")
    if not isinstance(api_port, int):
        raise ValueError(f"agent '{agent_id}' metadata has no valid api_port")

    if _ping_online(api_port):
        req = urllib.request.Request(
            f"http://127.0.0.1:{api_port}/admin/restart", method="POST"
        )
        urllib.request.urlopen(req, timeout=_RESTART_POST_TIMEOUT_SECS)
        _log.info("Asked online agent %s to restart via /admin/restart", agent_id)
        return {"status": "restarting", "running": True}

    _spawn_detached(agent_id)
    _log.info("Spawned offline agent %s via main.py", agent_id)
    return {"status": "starting", "running": False}


def _spawn_detached(agent_id: str) -> None:
    """Spawn `python agents/{agent_id}/main.py` with cwd=demos/demo0, detached.

    Working directory is the demo0 root so the agent's `agents.` / `app.` /
    `commons.` imports resolve, matching how scripts/run.sh launches agents.
    """
    settings = get_settings()
    demo_root = settings.repo_root  # _REPO_ROOT == demos/demo0
    main_py = settings.agents_dir / agent_id / "main.py"
    if not main_py.exists():
        raise FileNotFoundError(f"agent '{agent_id}' has no main.py")

    # Platform-appropriate detach: Windows uses creation flags, POSIX uses a new
    # session so the child outlives this request handler.
    popen_kwargs: dict[str, Any] = {
        "cwd": str(demo_root),
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        popen_kwargs["creationflags"] = 0x00000008 | 0x00000200
    else:
        popen_kwargs["start_new_session"] = True

    subprocess.Popen(
        [sys.executable, str(Path("agents") / agent_id / "main.py")],
        **popen_kwargs,
    )
