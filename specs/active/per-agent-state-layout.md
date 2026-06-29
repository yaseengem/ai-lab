# Spec: Per-Agent State Layout, Memory Layer & Backup/Restore

**Status:** done
**Version:** v1
**Date:** 2026-06-29

---

## Problem

Each agent persists several different kinds of data — operator config, learned
memory, in-flight cases, sessions, logs — but the layout was ad-hoc: config sat at
the agent root, runtime data was scattered under `data/` and `logs/`, and the git
boundary was maintained file-by-file. Three consequences:

1. **No clean backup/restore unit.** There was no single thing to snapshot; an
   operator couldn't reliably back up "an agent's state" and restore it elsewhere.
2. **HITL approval state was in-process only** (`asyncio.Future`). A restart while a
   case was paused for human approval **orphaned the case** — the workflow could
   never resume. For a gate that may wait days, that's a correctness bug.
3. **Memory was an undifferentiated key/value blob**, with no notion of the distinct
   memory types (rules vs learned facts vs run history).

We need a clean, standardized per-agent layout so **restart, backup, and restore**
become mechanical, and a real memory layer.

---

## Solution

Every agent splits cleanly into two halves:

- **Definition + code** (git-tracked, ships with the agent): `metadata.yaml`,
  `agent.config.yaml` (definition + defaults), `architecture.md`, code, and
  `seeds/` (scenario INPUT data — committed, fed through the APIs, never copied
  into state).
- **State** (gitignored, backup-eligible): a single `state/` root holding ALL
  mutable per-agent data, grouped by **backup behaviour**:

```
state/
  VERSION             schema marker (restore-across-versions)
  config/setup.yaml   operator OVERRIDES from the marketplace (restart-required)
  memory/             rules.json · facts.json · episodes.jsonl  (live, no restart)
  sessions/           {id}_meta.json · {id}.events.jsonl · {id}_{persona}_history.json
  data/{case_id}/     runtime cases (product of real API runs only)
  runs/               durable HITL gate state (survives restart)
  secrets/            .env / OAuth tokens
  index/              rebuildable caches — EXCLUDED from backup
  logs/               per-agent logs
  _run_seq/           per-day run-id counter
```

**Config splits, not renames.** `agent.config.yaml` stays in git as the
definition + defaults (personas, capabilities, integration catalog,
`defaults: {model_id, hitl_approval}`). `state/config/setup.yaml` holds only the
operator overrides written from the marketplace. Effective config = defaults ⊕
setup. While `setup.yaml` is absent the agent is **`awaiting_setup`**: it stays up
(so the marketplace can list and configure it) but refuses to process. A literal
whole-file rename would have left a fresh clone with no personas/capabilities for
the marketplace to render — hence the split.

**Memory layer** is file-backed and split by memory type (procedural rules,
semantic facts, episodic log), each with its own lock; changes are LIVE (no
restart), unlike config.

**Durable HITL.** The approval gate's state is now the source of truth on disk at
`state/runs/{session_id}.json`. On restart the run engine RESUMES any run still
paused for approval (and finalizes immediately if it was decided while the process
was down); only mid-compute runs are marked interrupted.

**Backup/restore** operate on whole directories: `scripts/agent_state.py` snapshots
`state/` (minus `index/`) with a manifest (agent id, versions, timestamp, per-file
sha256), and restores it, validating the schema version and rebuilding `index/`.

---

## Scope

### In scope

- New `state/` layout + `agentic/paths.py` as the single source of truth for paths.
- `agent.config.yaml` (definition+defaults) ⊕ `state/config/setup.yaml` (overrides);
  `effective_config()`, `is_configured()`, `awaiting_setup`.
- Three-file memory layer (`rules`/`facts`/`episodes`) with atomic writes + filelock.
- Durable HITL gate + restart-resume.
- `seeds/` for scenario inputs (moved from `data/test_scenarios/`); `data/`+`logs/`
  removed (now under `state/`).
- `.gitignore` for `state/` (agent + root); `scripts/agent_state.py` backup/restore.
- These changes are applied to the **`agentx_v2_0` template**, becoming the v2.0 standard.

### Not in scope

- AgentCore Memory backend (explicitly dropped — local file store only for now).
- Multi-worker HITL (the single-uvicorn-worker invariant still holds; the disk gate
  makes state durable across restarts, not across concurrent workers).
- Encrypting `secrets/` (kept in `state/` per decision; encryption is future work).
- Platform-side (demo0 `app/`) wiring of the marketplace Config form to write
  `setup.yaml` — the agent exposes `POST /admin/setup`; the GUI plumbing is separate.

---

## Architecture impact

- **New files:** `agents/agentx_v2_0/agentic/paths.py`,
  `scripts/agent_state.py`, `agents/agentx_v2_0/seeds/test_scenarios/*` (moved).
- **Rewritten:** `agentic/memory_backend.py`, `agentic/approval_hook.py`,
  `apis/service.py`.
- **Edited:** `apis/routes.py` (awaiting_setup guards, `/admin/setup`, memory
  snapshot), `apis/main.py` (state scaffolding, async startup recovery),
  `apis/test_routes.py`, `agentic/agent.py`, `agentic/model.py`,
  `agentic/tools/ops.py`, `create_dummy_data.py`, `agent.config.yaml`.
- **Removed:** `agents/agentx_v2_0/data/`, `agents/agentx_v2_0/logs/`.
- **No new dependencies** — `filelock` is already pinned; backup tooling is stdlib.
- New canonical endpoint: `POST /admin/setup`. `/ping` may now report
  `status: awaiting_setup`. Per-session events remain (`state/sessions/*.events.jsonl`).

---

## Implementation Checklist

- [x] `agentic/paths.py` — single source of truth + `ensure_state_dirs()` + `is_configured()`.
- [x] Memory layer: `rules.json` / `facts.json` / `episodes.jsonl` with atomic writes + filelock.
- [x] Config split: `effective_config()` (defaults ⊕ setup), `save_setup()`, `awaiting_setup`.
- [x] Durable HITL gate (`state/runs/`) + `recover_on_startup()` resume.
- [x] Routes: awaiting_setup guards on `/run` + `/chat`, `/admin/setup`, memory snapshot.
- [x] Move scenarios to `seeds/`; remove `data/` + `logs/`; update `create_dummy_data.py`.
- [x] `.gitignore` `state/` (agent + root); `scripts/agent_state.py` backup/restore.
- [ ] Update `GUIDELINES.md` + `docs/` (architecture/conventions) to the new layout.
- [ ] pytest tests; full suite green; `git status` shows nothing under `agents/*/state/`.

---

## Verification

- **Unit/integration** (run from `demos/demo0`): memory round-trip (rules/facts/
  episodes), `awaiting_setup` then configured self-check, effective-config merge,
  durable HITL (pause → simulated restart → resume to completion), backup→wipe→restore
  with checksum verification and `index/` rebuilt. (All passing via smoke runs;
  pytest equivalents pending.)
- **Lifecycle E2E:** fresh agent → `/ping` reports `awaiting_setup`, `/run` returns
  409 → `POST /admin/setup` + restart → `/ping` ready → feed `seeds/test_scenarios/*`
  through the API → case in `state/data/`.
- **Git boundary:** `git status` shows nothing under any `agents/*/state/`; `seeds/`
  and code remain tracked.
