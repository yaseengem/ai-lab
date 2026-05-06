"""
Local memory backend for the Settlement Failure Prevention Agent.

File-backed key-value store persisting to data/memory/demo4_memory.json.
Thread safety: FileLock (cross-process) + threading.RLock (in-process).
Atomic writes: write to .tmp then os.replace().
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from filelock import FileLock

_AGENT_DIR = Path(__file__).parent.parent
_DEFAULT_MEMORY_DIR = _AGENT_DIR / "data" / "memory"


class LocalMemoryStore:
    """File-backed key-value store persisted to a single JSON file."""

    def __init__(self, agent_name: str, memory_dir: Path | None = None) -> None:
        mem_dir = memory_dir or _DEFAULT_MEMORY_DIR
        mem_dir.mkdir(parents=True, exist_ok=True)

        self._path = mem_dir / f"{agent_name}_memory.json"
        self._lock_path = str(self._path) + ".lock"
        self._rlock = threading.RLock()

        if not self._path.exists():
            self._write_raw({})

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

    def list_keys(self) -> list[str]:
        with self._rlock:
            with FileLock(self._lock_path):
                return list(self._read_raw().keys())

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
    def __init__(self, agent_name: str) -> None:
        self._agent_name = agent_name

    def _not_implemented(self) -> None:
        raise NotImplementedError(
            "AgentCore Memory backend is not yet implemented. "
            "Set MEMORY_BACKEND=local."
        )

    def get(self, key: str) -> Any | None:
        self._not_implemented()

    def set(self, key: str, value: Any) -> None:
        self._not_implemented()

    def delete(self, key: str) -> None:
        self._not_implemented()

    def list_keys(self) -> list[str]:
        self._not_implemented()


def create_memory_backend(agent_name: str) -> LocalMemoryStore | StubAgentCoreMemory:
    backend = os.getenv("MEMORY_BACKEND", "local").strip().lower()
    if backend == "local":
        return LocalMemoryStore(agent_name)
    if backend == "agentcore":
        return StubAgentCoreMemory(agent_name)
    raise ValueError(f"Unknown MEMORY_BACKEND value: '{backend}'. Accepted: 'local', 'agentcore'.")
