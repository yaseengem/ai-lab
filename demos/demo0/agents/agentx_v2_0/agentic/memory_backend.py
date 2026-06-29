"""
Agent memory layer for the v2.0 template.

Memory is what the agent *learns and remembers* — distinct from raw chat history
(state/sessions/) and from operator config (state/config/setup.yaml). It is split
into three files by memory type, each with its own writer, so a chat-driven rule
edit and a workflow-appended episode never contend on the same lock:

  state/memory/rules.json       PROCEDURAL — admin-authored rules, injected into
                                the system prompt on every invocation.
  state/memory/facts.json       SEMANTIC   — learned key→{value, source, ts}.
  state/memory/episodes.jsonl   EPISODIC   — append-only one-line run/case summaries.

All changes are LIVE — they take effect on the next agent invocation with no
restart (unlike config). Thread/process safety: filelock (cross-process) +
threading.RLock (in-process). Atomic writes: temp file + os.replace so readers
never see partial JSON.
"""

from __future__ import annotations

import json
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from filelock import FileLock

from .paths import EPISODES_FILE, FACTS_FILE, MEMORY_DIR, RULES_FILE


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryStore:
    """File-backed agent memory: procedural rules, semantic facts, episodic log."""

    def __init__(self) -> None:
        MEMORY_DIR.mkdir(parents=True, exist_ok=True)
        self._rlock = threading.RLock()
        self._rules_lock = FileLock(str(RULES_FILE) + ".lock")
        self._facts_lock = FileLock(str(FACTS_FILE) + ".lock")
        self._episodes_lock = FileLock(str(EPISODES_FILE) + ".lock")

    # ── procedural: rules ─────────────────────────────────────────────────────

    def get_rules(self) -> list[dict]:
        with self._rlock, self._rules_lock:
            return list(self._read_json(RULES_FILE, default=[]))

    def set_rules(self, rules: list[dict | str]) -> list[dict]:
        """Replace the whole ruleset. Bare strings are wrapped into rule objects."""
        normalised = [self._as_rule(r) for r in rules]
        with self._rlock, self._rules_lock:
            self._write_json(RULES_FILE, normalised)
        return normalised

    def add_rule(self, text: str) -> dict:
        rule = self._as_rule(text)
        with self._rlock, self._rules_lock:
            rules = list(self._read_json(RULES_FILE, default=[]))
            rules.append(rule)
            self._write_json(RULES_FILE, rules)
        return rule

    def remove_rule(self, rule_id: str) -> bool:
        with self._rlock, self._rules_lock:
            rules = list(self._read_json(RULES_FILE, default=[]))
            kept = [r for r in rules if r.get("id") != rule_id]
            if len(kept) == len(rules):
                return False
            self._write_json(RULES_FILE, kept)
            return True

    # ── semantic: facts ───────────────────────────────────────────────────────

    def get_facts(self) -> dict[str, Any]:
        with self._rlock, self._facts_lock:
            return dict(self._read_json(FACTS_FILE, default={}))

    def get_fact(self, key: str) -> Any | None:
        return self.get_facts().get(key)

    def set_fact(self, key: str, value: Any, source: str | None = None) -> None:
        with self._rlock, self._facts_lock:
            facts = dict(self._read_json(FACTS_FILE, default={}))
            facts[key] = {"value": value, "source": source, "ts": _now_iso()}
            self._write_json(FACTS_FILE, facts)

    def delete_fact(self, key: str) -> None:
        with self._rlock, self._facts_lock:
            facts = dict(self._read_json(FACTS_FILE, default={}))
            facts.pop(key, None)
            self._write_json(FACTS_FILE, facts)

    # ── episodic: append-only log ─────────────────────────────────────────────

    def add_episode(self, episode: dict) -> dict:
        record = {"ts": _now_iso(), **episode}
        with self._rlock, self._episodes_lock:
            with open(EPISODES_FILE, "a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record

    def recent_episodes(self, limit: int = 20) -> list[dict]:
        with self._rlock, self._episodes_lock:
            if not EPISODES_FILE.exists():
                return []
            episodes: list[dict] = []
            with open(EPISODES_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        episodes.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
        return episodes[-limit:] if limit else episodes

    # ── snapshot (feeds GET /memory and the get_memory chat tool) ─────────────

    def snapshot(self, episode_limit: int = 20) -> dict:
        return {
            "rules": self.get_rules(),
            "facts": self.get_facts(),
            "episodes": self.recent_episodes(episode_limit),
        }

    # ── internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _as_rule(rule: dict | str) -> dict:
        if isinstance(rule, dict):
            return {
                "id": rule.get("id") or uuid.uuid4().hex[:12],
                "text": rule.get("text", ""),
                "created_at": rule.get("created_at") or _now_iso(),
            }
        return {"id": uuid.uuid4().hex[:12], "text": str(rule), "created_at": _now_iso()}

    @staticmethod
    def _read_json(path, default):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return default

    @staticmethod
    def _write_json(path, data) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = str(path) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, str(path))


_store: MemoryStore | None = None


def get_memory_store() -> MemoryStore:
    """Return the process-wide memory store (created on first use)."""
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


# Back-compat alias for callers that used the old factory name.
def create_memory_backend(*_args, **_kwargs) -> MemoryStore:
    return get_memory_store()
