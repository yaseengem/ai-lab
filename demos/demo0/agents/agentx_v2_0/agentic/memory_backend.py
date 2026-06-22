"""
Local memory backend for the v2.0 template agent.

File-backed key/value store persisting to data/memory/agent_memory.json
(agent-relative). Holds the agent's rules / preferences / long-term memory.
A factory reads the MEMORY_BACKEND env var so swapping to AgentCore Memory
later requires only changing one environment variable — no code changes.

Thread safety: FileLock (cross-process) + threading.RLock (in-process).
Atomic writes: write to .tmp then os.replace() so readers never see partial JSON.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from filelock import FileLock

# Default memory dir: <agent_folder>/data/memory/
_AGENT_DIR = Path(__file__).parent.parent
_DEFAULT_MEMORY_DIR = _AGENT_DIR / "data" / "memory"

# All agent state lives in one JSON file: data/memory/agent_memory.json
_MEMORY_FILE_STEM = "agent"


class LocalMemoryStore:
    """File-backed key-value store persisted to data/memory/{name}_memory.json."""

    def __init__(self, agent_name: str = _MEMORY_FILE_STEM, memory_dir: Path | None = None) -> None:
        mem_dir = memory_dir or _DEFAULT_MEMORY_DIR
        mem_dir.mkdir(parents=True, exist_ok=True)

        self._path = mem_dir / f"{agent_name}_memory.json"
        self._lock_path = str(self._path) + ".lock"
        self._rlock = threading.RLock()

        if not self._path.exists():
            self._write_raw({})

    # ── public API ──────────────────────────────────────────────────────────

    def get(self, key: str) -> Any | None:
        with self._rlock:
            with FileLock(self._lock_path):
                return self._read_raw().get(key)

    def set(self, key: str, value: Any) -> None:
        with self._rlock:
            with FileLock(self._lock_path):
                data = self._read_raw()
                data[key] = value
                self._write_raw(data)

    def delete(self, key: str) -> None:
        with self._rlock:
            with FileLock(self._lock_path):
                data = self._read_raw()
                data.pop(key, None)
                self._write_raw(data)

    def all(self) -> dict:
        """Return a snapshot of the entire memory store."""
        with self._rlock:
            with FileLock(self._lock_path):
                return dict(self._read_raw())

    def list_keys(self) -> list[str]:
        with self._rlock:
            with FileLock(self._lock_path):
                return list(self._read_raw().keys())

    # ── internal helpers ────────────────────────────────────────────────────

    def _read_raw(self) -> dict:
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _write_raw(self, data: dict) -> None:
        tmp = str(self._path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, self._path)


class StubAgentCoreMemory:
    """
    Placeholder for a future AgentCore Memory backend.

    Every method raises NotImplementedError with migration instructions so the
    failure is loud rather than silently dropping data.
    """

    def __init__(self, agent_name: str = _MEMORY_FILE_STEM) -> None:
        self._agent_name = agent_name

    def _not_implemented(self) -> None:
        raise NotImplementedError(
            "AgentCore Memory backend is not yet implemented. Set MEMORY_BACKEND=local."
        )

    def get(self, key: str) -> Any | None:
        self._not_implemented()

    def set(self, key: str, value: Any) -> None:
        self._not_implemented()

    def delete(self, key: str) -> None:
        self._not_implemented()

    def all(self) -> dict:
        self._not_implemented()

    def list_keys(self) -> list[str]:
        self._not_implemented()


def create_memory_backend(agent_name: str = _MEMORY_FILE_STEM) -> LocalMemoryStore | StubAgentCoreMemory:
    """
    Factory returning the correct memory backend based on MEMORY_BACKEND:
      - "local" (default) → LocalMemoryStore
      - "agentcore"       → StubAgentCoreMemory (raises on use)
    """
    backend = os.getenv("MEMORY_BACKEND", "local").strip().lower()
    if backend == "local":
        return LocalMemoryStore(agent_name)
    if backend == "agentcore":
        return StubAgentCoreMemory(agent_name)
    raise ValueError(
        f"Unknown MEMORY_BACKEND value: '{backend}'. Accepted: 'local', 'agentcore'."
    )
