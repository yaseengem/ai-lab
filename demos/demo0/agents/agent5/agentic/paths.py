"""
Single source of truth for this agent's on-disk layout (v2.0 template).

The agent folder splits cleanly into two halves:

  • DEFINITION + CODE  — git-tracked, ships with the agent. Never written at runtime.
        agent.config.yaml, metadata.yaml, architecture.md, seeds/ (scenario inputs)
        (`seeds/` holds git-tracked INPUT data; `tests/` is the pytest package —
        kept distinct on purpose.)

  • STATE              — gitignored, backup-eligible. ALL mutable per-agent data,
        grouped by backup behaviour under one `state/` root:

        state/
          VERSION            schema marker (restore-across-versions)
          config/setup.yaml  operator overrides from the marketplace (restart-required)
          memory/            rules.json · facts.json · episodes.jsonl  (live, no restart)
          sessions/          {id}_meta.json · {id}.events.jsonl · {id}_{persona}_history.json
          data/{case_id}/    runtime cases (product of real API runs only)
          runs/              durable HITL/workflow gate state (survives restart)
          secrets/           .env / OAuth tokens (gitignored with the rest of state)
          index/             rebuildable caches — EXCLUDED from backup
          logs/              per-agent logs
          _run_seq/          per-day run-id counter

Every other module imports its paths from here so the layout has exactly one
definition. Nothing here is created at import time; call ensure_state_dirs() once
at startup (the FastAPI startup hook does).
"""

from __future__ import annotations

from pathlib import Path

# agents/agent5/agentic/paths.py  →  agents/agent5/
AGENT_DIR = Path(__file__).resolve().parent.parent

# Bump when the on-disk state format changes incompatibly; backup/restore checks it.
STATE_SCHEMA_VERSION = "1"

# ── Definition + code (git-tracked) ──────────────────────────────────────────
CONFIG_DEF_FILE = AGENT_DIR / "agent.config.yaml"      # definition + defaults
METADATA_FILE = AGENT_DIR / "metadata.yaml"
ARCHITECTURE_FILE = AGENT_DIR / "architecture.md"
CONTENT_DIR = AGENT_DIR / "content"                    # Trianz knowledge pages (operator-supplied)
SEEDS_DIR = AGENT_DIR / "seeds"
TEST_SCENARIOS_DIR = SEEDS_DIR / "test_scenarios"
DUMMY_DIR = SEEDS_DIR / "dummy"

# ── State (gitignored, backup-eligible) ──────────────────────────────────────
STATE_DIR = AGENT_DIR / "state"
VERSION_FILE = STATE_DIR / "VERSION"

CONFIG_DIR = STATE_DIR / "config"
SETUP_FILE = CONFIG_DIR / "setup.yaml"                  # operator overrides

MEMORY_DIR = STATE_DIR / "memory"
RULES_FILE = MEMORY_DIR / "rules.json"                 # procedural
FACTS_FILE = MEMORY_DIR / "facts.json"                 # semantic
EPISODES_FILE = MEMORY_DIR / "episodes.jsonl"          # episodic (append-only)

SESSIONS_DIR = STATE_DIR / "sessions"
DATA_DIR = STATE_DIR / "data"                          # runtime cases (leads/, meetings/)
RUNS_DIR = STATE_DIR / "runs"                          # durable HITL gate state
AUTH_DIR = STATE_DIR / "auth"                          # OTP challenges + verified sessions
SECRETS_DIR = STATE_DIR / "secrets"
INDEX_DIR = STATE_DIR / "index"                        # rebuildable — not backed up
LOGS_DIR = STATE_DIR / "logs"
RUN_SEQ_DIR = STATE_DIR / "_run_seq"

# Convenience subfolders of DATA_DIR for this agent's runtime artifacts.
LEADS_DIR = DATA_DIR / "leads"                         # captured sales leads
MEETINGS_DIR = DATA_DIR / "meetings"                   # booked human-meeting requests

# Directories created by ensure_state_dirs(). config/ is intentionally created so the
# folder exists, but setup.yaml is NOT — its absence is what signals awaiting_setup.
_STATE_SUBDIRS = (
    CONFIG_DIR, MEMORY_DIR, SESSIONS_DIR, DATA_DIR, RUNS_DIR, AUTH_DIR,
    SECRETS_DIR, INDEX_DIR, LOGS_DIR, RUN_SEQ_DIR,
)


def ensure_state_dirs() -> None:
    """Create the state/ tree if missing and stamp VERSION. Idempotent."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    for d in _STATE_SUBDIRS:
        d.mkdir(parents=True, exist_ok=True)
    if not VERSION_FILE.exists():
        VERSION_FILE.write_text(STATE_SCHEMA_VERSION, encoding="utf-8")


def is_configured() -> bool:
    """True once the operator has saved setup from the marketplace."""
    return SETUP_FILE.exists()
