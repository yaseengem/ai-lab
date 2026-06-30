"""
Operations-awareness tools for the v2.0 template chat agent.

These @tool functions give the chat agent READ access to its own operational
state on disk, so it can answer questions like "list recent runs", "show me
case X", "what rules are active?", "which model is this agent using?", "is the
agent healthy?", "what's waiting for my approval?".

All paths are agent-relative. Reads are tolerant of missing/partial files —
they return a structured "empty" result rather than raising, so the chat agent
degrades gracefully.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from strands import tool

from ..paths import (
    DATA_DIR as _DATA_DIR,
    LEADS_DIR as _LEADS_DIR,
    MEETINGS_DIR as _MEETINGS_DIR,
    RUNS_DIR as _RUNS_DIR,
    SESSIONS_DIR as _SESSIONS_DIR,
)


# ── low-level readers (shared with service self-check) ────────────────────────

def _read_json(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _read_events(session_id: str, limit: int = 50) -> list[dict]:
    path = _SESSIONS_DIR / f"{session_id}.events.jsonl"
    if not path.exists():
        return []
    events: list[dict] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events[-limit:] if limit else events


def _list_meta() -> list[dict]:
    _SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    metas = []
    for f in sorted(_SESSIONS_DIR.glob("*_meta.json"),
                    key=lambda p: p.stat().st_mtime, reverse=True):
        data = _read_json(f)
        if data:
            metas.append(data)
    return metas


def _read_case(case_dir: Path) -> dict:
    """
    Read one case folder (state/data/{case_id}/) generically: parse every *.json
    artifact into the result and list any non-JSON files by name. The template
    does not fix a case schema, so this stays structure-agnostic.
    """
    artifacts: dict[str, object] = {}
    other_files: list[str] = []
    for item in sorted(case_dir.rglob("*")):
        if not item.is_file():
            continue
        rel = item.relative_to(case_dir).as_posix()
        if item.suffix == ".json":
            parsed = _read_json(item)
            artifacts[rel] = parsed if parsed is not None else "<unreadable json>"
        else:
            other_files.append(rel)
    return {
        "case_id": case_dir.name,
        "artifacts": artifacts,
        "other_files": other_files,
        "file_count": len(artifacts) + len(other_files),
    }


# ── @tool functions ──────────────────────────────────────────────────────────

@tool
def list_runs(limit: int = 20) -> str:
    """
    List recent processing runs (most recent first) with their status.

    Args:
        limit: Maximum number of runs to return (default 20).

    Returns:
        JSON string: {"count": N, "runs": [{run_id, session_id, status, created_at, completed_at}, ...]}
    """
    metas = _list_meta()[: max(1, limit)]
    runs = [
        {
            "run_id": m.get("run_id"),
            "session_id": m.get("session_id"),
            "status": m.get("status"),
            "persona": m.get("persona"),
            "trigger_mode": m.get("trigger_mode"),
            "created_at": m.get("created_at"),
            "completed_at": m.get("completed_at"),
            "event_count": m.get("event_count", 0),
        }
        for m in metas
    ]
    return json.dumps({"count": len(runs), "runs": runs})


@tool
def get_run(run_id: str) -> str:
    """
    Get details and recent events for a single run, looked up by run_id or session_id.

    Args:
        run_id: The RUN-… id (or a session id) to look up.

    Returns:
        JSON string with {meta, events} for the run, or {"error": "..."} if not found.
    """
    metas = _list_meta()
    match = next(
        (m for m in metas if m.get("run_id") == run_id or m.get("session_id") == run_id),
        None,
    )
    if match is None:
        return json.dumps({"error": f"No run found for '{run_id}'"})
    events = _read_events(match.get("session_id", ""))
    return json.dumps({"meta": match, "events": events})


@tool
def get_memory() -> str:
    """
    Return the agent's memory: procedural rules, semantic facts, and recent episodes.

    Returns:
        JSON string {"memory": {"rules": [...], "facts": {...}, "episodes": [...]}}.
    """
    from ..memory_backend import get_memory_store
    return json.dumps({"memory": get_memory_store().snapshot()})


@tool
def get_config() -> str:
    """
    Return the agent's effective runtime configuration (personas, features, defaults,
    capabilities) — the definition merged with operator setup.

    Use this to answer questions like "which model is this agent using?" or
    "is human-in-the-loop approval enabled?".

    Returns:
        JSON string of the effective config.
    """
    from agents.agent5.apis.service import effective_config
    return json.dumps(effective_config())


@tool
def get_health() -> str:
    """
    Return the agent's startup self-check / readiness summary.

    Returns:
        JSON string: {"status": "ok"|"degraded", "checks": [{name, ok, detail}, ...]}.
    """
    # Import lazily to avoid a circular import (service imports tools indirectly).
    from agents.agent5.apis.service import Service

    return json.dumps(Service.self_check())


@tool
def list_cases(limit: int = 20) -> str:
    """
    List the agent's runtime cases — the per-case data folders the agent produces
    while processing (state/data/{case_id}/), most recently modified first.

    Use this for questions like "what cases exist?" or "show me recent cases".

    Args:
        limit: Maximum number of cases to return (default 20).

    Returns:
        JSON string: {"count": N, "cases": [{case_id, file_count, modified_at}, ...]}.
    """
    if not _DATA_DIR.exists():
        return json.dumps({"count": 0, "cases": []})
    case_dirs = sorted(
        (d for d in _DATA_DIR.iterdir() if d.is_dir()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[: max(1, limit)]
    cases = [
        {
            "case_id": d.name,
            "file_count": sum(1 for _ in d.rglob("*") if _.is_file()),
            "modified_at": datetime.fromtimestamp(
                d.stat().st_mtime, timezone.utc
            ).isoformat(),
        }
        for d in case_dirs
    ]
    return json.dumps({"count": len(cases), "cases": cases})


@tool
def get_case(case_id: str) -> str:
    """
    Get all stored data for a single case by case_id — every JSON artifact the
    agent wrote for it (analysis, decisions, status, etc.) plus any other files.

    Use this to answer "what's in case X?" or "why was case X rejected?".

    Args:
        case_id: The case folder name under state/data/.

    Returns:
        JSON string with the case's artifacts, or {"error": "..."} if not found.
    """
    case_dir = _DATA_DIR / case_id
    # Guard against path traversal — only direct children of DATA_DIR are valid.
    if case_dir.parent != _DATA_DIR or not case_dir.is_dir():
        return json.dumps({"error": f"No case found for '{case_id}'"})
    return json.dumps(_read_case(case_dir))


def _read_records(directory: Path, limit: int) -> list[dict]:
    """Read every *.json record in a state/data subfolder, most recent first."""
    if not directory.exists():
        return []
    records: list[dict] = []
    for f in sorted(directory.glob("*.json"),
                    key=lambda p: p.stat().st_mtime, reverse=True):
        data = _read_json(f)
        if data:
            records.append(data)
    return records[: max(1, limit)] if limit else records


@tool
def list_meetings(limit: int = 50) -> str:
    """
    List booked human-meeting requests (appointment bookings) the agent has recorded,
    most recent first. Each record shows whether a calendar invite was emailed via AWS
    SES — `delivery` is "ses" (sent), "skipped" (SES not configured — booking still kept),
    or "failed" (SES configured but the send errored).

    Use for "what meetings were booked?", "did we email the invite?", "show appointments".

    Returns:
        JSON string: {"count": N, "meetings": [{meeting_id, email, name, topic,
        scheduled_for, email_sent, delivery, created_at}, ...]}.
    """
    fields = ("meeting_id", "email", "name", "topic", "scheduled_for",
              "email_sent", "delivery", "created_at")
    meetings = [{k: m.get(k) for k in fields} for m in _read_records(_MEETINGS_DIR, limit)]
    return json.dumps({"count": len(meetings), "meetings": meetings})


@tool
def list_leads(limit: int = 50) -> str:
    """
    List captured sales leads, most recent first.

    Use for "what leads do we have?", "recent prospects", "who's interested?".

    Returns:
        JSON string: {"count": N, "leads": [{lead_id, email, name, company, interest,
        created_at}, ...]}.
    """
    fields = ("lead_id", "email", "name", "company", "interest", "created_at")
    leads = [{k: m.get(k) for k in fields} for m in _read_records(_LEADS_DIR, limit)]
    return json.dumps({"count": len(leads), "leads": leads})


@tool
def list_pending_approvals() -> str:
    """
    List runs currently paused for a human approval decision (open HITL gates in
    state/runs/). Use for "what's waiting for my approval?" / "anything pending?".

    Returns:
        JSON string: {"count": N, "pending": [{session_id, item_id, opened_at}, ...]}.
    """
    if not _RUNS_DIR.exists():
        return json.dumps({"count": 0, "pending": []})
    pending = []
    for f in sorted(_RUNS_DIR.glob("*.json"),
                    key=lambda p: p.stat().st_mtime, reverse=True):
        gate = _read_json(f)
        if gate and gate.get("status") == "open":
            pending.append({
                "session_id": gate.get("session_id"),
                "item_id": gate.get("item_id"),
                "opened_at": gate.get("opened_at"),
            })
    return json.dumps({"count": len(pending), "pending": pending})
