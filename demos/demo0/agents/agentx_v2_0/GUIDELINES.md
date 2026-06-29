# New Agent Guidelines (Template v2.0)

This is the **v2.0 template — the latest**. Copy *this* folder (not `agentx_v1_0`)
when starting a new agent. `agentx_v1_0` stays frozen for reference only. Future
template versions live alongside as `agents/agentx_v3_0/`, etc.; always pick the
highest version present. (All agents live under `demos/demo0/agents/`.)

**Never modify a template. Never start a template.** Every `agentx_vN_M` carries
`status: template`, so the platform scanner skips it.

## Starting a new agent

Run from `demos/demo0`:

1. Copy this folder: `cp -r agents/agentx_v2_0 agents/agentN`
2. Update `metadata.yaml`:
   - set `name`, `use_case`, `domain`
   - set `description` — **fewer than 25 words**, one sentence: what the agent automates and where a human steps in. Keep it tight so detail-page and card widgets render at a uniform, bounded height
   - set `card_description` — marketplace card text, **≤ 140 chars** (≈ 24 words) so all cards render at uniform height
   - set `icon` — emoji or icon key (required)
   - set `version` — **semver** (`MAJOR.MINOR.PATCH`)
   - set `api_port: 80N1` and `frontend_port: 80N0` — pick the **next free** pair per `docs/ports.md` (see step 5)
   - change `status: template` → `status: stub` (or `active`)
   - update `entry_point` to `agents.agentN.apis.main:app` (use the new folder name)
   - keep `template_version: "2.0"` so we can track which template version this agent inherits from — don't change it later
3. Update Python module strings inside the new folder: any `agents.agentx_v2_0.*` → `agents.agentN.*`
4. Write a spec in `specs/` first (see `specs/_template.md`) — no code without an approved spec.
5. **Ports**: pick the next free `80N0`/`80N1` pair from `docs/ports.md` and **add a row to `docs/ports.md`** in the same change, advancing the "next free" marker. `scripts/run.sh` validates port conflicts at launch.
6. Fill in `agent.config.yaml` — this is the git-tracked **definition + defaults** (personas, capabilities, the `integrations` catalog, and `defaults: {model_id, hitl_approval}`). List each external system under `integrations` (id, name, category, description, `auth_type`, `auth_url`, `connected`) — leave `auth_url` blank for a mock Connect button, or set it to make the button open a real OAuth page. Operator **overrides** (chosen model, HITL toggle, integration connections) are written separately to `state/config/setup.yaml` from the marketplace — don't put them here.
7. Implement agentic logic inside `agentic/` (import all paths from `agentic/paths.py`), wire the FastAPI app in `apis/`, build the must-have pages in `frontend/`, and write your `seeds/test_scenarios/*.json`.
8. Write `architecture.md` (≤ 1000 words, with a Mermaid diagram).

## Folder map

The agent folder splits into two halves — **definition + code** (git-tracked) and
**state** (gitignored, backup-eligible). See "State & lifecycle" below.

```
agents/agentN/                  ── DEFINITION + CODE (git-tracked) ──
├── metadata.yaml          # identity/discovery — read by platform scanner and main.py
├── agent.config.yaml      # DEFINITION + DEFAULTS — personas, capabilities, integration
│                          #   catalog, defaults:{model_id, hitl_approval}. NOT written at runtime.
├── main.py                # starts API + frontend (copy from template, unchanged)
├── GUIDELINES.md          # (remove from your copy once read)
├── architecture.md        # one-page architecture (≤1000 words + Mermaid) — served by GET /architecture
├── create_dummy_data.py   # writes INPUT data into seeds/dummy/ (committed, fed via API)
│
├── agentic/               # all AI/agent code as FLAT modules — NO sub_agents/ folder
│   ├── paths.py           # SINGLE SOURCE OF TRUTH for the on-disk layout — import paths from here
│   ├── agent.py           # top-level Strands agent: build the Agent, expose run_chat()
│   ├── model.py           # Bedrock model client (effective model id: setup ⊕ defaults)
│   ├── prompts.py         # system prompt strings
│   ├── memory_backend.py  # MemoryStore — rules/facts/episodes (see "Memory layer")
│   ├── approval_hook.py   # DURABLE HITL gate (state/runs/) — survives restart
│   └── tools/             # @tool-decorated functions
│                          # specialist sub-agents go here as sibling modules
│                          # (e.g. agentic/fraud_agent.py) — never a sub_agents/ subfolder
│
├── apis/                  # FastAPI application
│   ├── main.py            # FastAPI app, CORS; scaffolds state/ + startup recovery
│   ├── routes.py          # canonical endpoints; /ping carries the startup self-check
│   ├── test_routes.py     # /test/scenarios, /test/scenarios/{id}/data, /test/run/{id}
│   ├── service.py         # run lifecycle, effective config, durable HITL, per-session events
│   └── schemas.py         # Pydantic request/response models
│
├── frontend/              # standalone Vite + React + TS project (App.tsx, Ribbon, pages/…)
│
├── seeds/                 # git-tracked INPUT data (NOT runtime state)
│   ├── test_scenarios/    # *.json scenarios with `expected` blocks for self-test
│   └── dummy/             # sample records from create_dummy_data.py
├── tests/                 # pytest test files (distinct from seeds/ on purpose)
│   └── __init__.py
│
└── state/                 ── STATE (gitignored, backup-eligible; created on boot) ──
    ├── VERSION            # schema marker for restore-across-versions
    ├── config/setup.yaml  # operator OVERRIDES from the marketplace (restart-required).
    │                      #   ABSENT ⇒ agent is `awaiting_setup` (up, but refuses to process)
    ├── memory/            # rules.json · facts.json · episodes.jsonl  (LIVE — no restart)
    ├── sessions/          # {id}_meta.json · {id}.events.jsonl · {id}_{persona}_history.json
    ├── data/{case_id}/    # runtime cases (product of real API runs only)
    ├── runs/              # durable HITL gate state ({session_id}.json)
    ├── secrets/           # .env / OAuth tokens
    ├── index/             # rebuildable caches — EXCLUDED from backup
    ├── logs/              # THIS agent's logs only — never a shared/root logs dir
    └── _run_seq/          # per-day run-id counter
```

**No `sub_agents/` folder.** Strands agent code lives as flat modules in `agentic/`:
`agent.py` is the top-level agent; any specialist sub-agents are sibling modules
(e.g. `agentic/fraud_agent.py`), not a nested subfolder. The v1.0 placeholder is dropped.

## v2.0 standard — what every agent must ship

**Must-have pages**, each rendered inside the standard ribbon and filtered to the active persona's `visible_pages`:

| Page | Route | Notes |
|------|-------|-------|
| Persona Select | `/` (gate) | **Start point.** No page is reachable until a persona is chosen; choosing one routes to its `default_landing` (Chat by default). |
| Chat | `/chat` | **Default landing after persona select.** SSE streaming, persona-aware, **operations-aware** (see below). |
| Command Center | `/home` | Dashboard — status tiles, recent runs, startup self-check / readiness, quick actions. Reached from the ribbon, not the default landing. |
| Memory | `/memory` | View what the agent learned — procedural rules, semantic facts, episodic run log. |
| Architecture | `/architecture` | Renders bundled `architecture.md` (≤1000 words + Mermaid) plus the capabilities manifest. |
| Processing | `/processing` | Trigger + watch a run; resumable live output (survives refresh); HITL approval surface. |
| Test Runner | `/test-runner` | Lists demo/test scenarios; runs any live; shows pass/fail vs `expected`. |
| Agent Config | `/config` | View `agent.config.yaml` as friendly fields incl. connected systems (read-only in the agent UI; authoritative edit is at platform level). Admin-type personas only. |

**Standard ribbon** — a single `Ribbon` component (top bar + left nav), copied into the agent and kept visually identical. Top bar: agent icon + name + version, current persona + "switch persona" (returns to the gate), a live status dot. Left nav: the must-have pages filtered to the active persona's `visible_pages`. Light theme only (shared CSS variables from `demos/demo0/frontend/src/index.css`).

**Personas in `agent.config.yaml`** — personas are declared in `agent.config.yaml` (not hardcoded), each with `id`, `label`, `icon`, `description`, `visible_pages`, `default_landing`. The persona-select gate reads them and renders one card each. Personas are a chosen *view*, not a security boundary (no auth).

**Operations-aware chat** — Chat is the primary control/observability surface. Scoped to the active persona, it answers questions about all agent operations: runs/cases ("status of RUN-…?", "list recent runs"), memory/rules ("what rules are active?"), config ("which model is this agent using?", "is HITL on?"), status/readiness (surfacing the startup self-check), and processing outcomes (explain a decision + audit trail). Implemented with read-access tools over the agent's own state (sessions/`events.jsonl`, memory backend, `agent.config.yaml`, `/ping`) — all agent-owned. Write actions stay gated to admin-type personas.

**Full scenario-based self-test** (agent4-grade) — `seeds/test_scenarios/*.json` with `id`, `name`, `description`, `tags`, mock input, and an `expected` block; `apis/test_routes.py` (`GET /test/scenarios`, `GET /test/scenarios/{id}/data`, `POST /test/run/{id}` — injects mock data and starts a **real** run, whose artifacts land in `state/`); a Test Runner page that streams live output and shows pass/fail vs `expected`; and `create_dummy_data.py` to write sample INPUT data into `seeds/dummy/`. Every agent must be runnable end-to-end with zero external setup.

**Canonical API contract** — every agent exposes this set (verified by a platform contract test):

| Group | Endpoints |
|-------|-----------|
| Health | `GET /ping` — `{status, agent, version}`; `status` = startup self-check (`awaiting_setup \| ok \| degraded` + reasons). |
| Identity | `GET /config` (effective config + `configured` flag), `GET /personas`, `GET /architecture`. |
| Chat | `POST /chat/{session_id}` (SSE) — 409 while `awaiting_setup`. |
| Sessions | `GET /sessions`, `GET /sessions/{id}`. |
| Processing | `POST /run` (409 while `awaiting_setup`), `GET /monitor/{id}` (SSE) — no `/process` alias. |
| HITL | `POST /approve/{id}`, `POST /reject/{id}` — **always present**; return a clear "approvals disabled" response when HITL is off. Gate state is durable (`state/runs/`) and survives restart. |
| Memory | `GET /memory` — `{rules, facts, episodes}`. |
| Test | `GET /test/scenarios`, `GET /test/scenarios/{id}/data`, `POST /test/run/{id}`. |
| Admin | `POST /admin/setup` — persist operator setup to `state/config/setup.yaml`; `POST /admin/restart` — graceful self-restart to reload config + setup. |

**Startup self-check** — on boot the agent reports readiness via `/ping`. If no `state/config/setup.yaml` exists it reports **`awaiting_setup`** (up, listable, configurable — but processing endpoints return 409). Once configured it validates config/env (resolved model id, definition parse) and reports `ok | degraded` + reasons. The Command Center renders the reason so an unconfigured/misconfigured agent explains *why* instead of failing silently.

**Resumable live output** — runs append to a per-session `state/sessions/{id}.events.jsonl`; the Processing page replays from the cursor (`Last-Event-ID`) over SSE then continues live, so it survives a refresh.

**HITL approval (durable)** — a standard `approval_hook.py`, toggled by the effective `hitl_approval` setting. Gate state is the source of truth on disk at `state/runs/{session_id}.json`, so a run paused for approval **survives a restart**: on boot the engine resumes any still-open gate (and finalizes immediately if it was decided while the process was down). The `/approve` and `/reject` endpoints are **always present** (inert when the toggle is off) to keep the contract uniform.

**Capabilities manifest** — `capabilities` (`tools` / `can` / `cannot`) in `agent.config.yaml` renders on the Architecture page so the agent self-documents.

**architecture.md** — bundled per-agent, ≤ 1000 words, **must include a Mermaid diagram**; served by `GET /architecture` and rendered on the Architecture page.

**Per-agent logs only** — write to this agent's own `state/logs/`, never a shared/root log folder.

**No pricing** — the template ships **no** pricing page, tile, field, or copy. Pricing is forbidden in agent UIs.

**Config split + edited at platform level + Restart** — `agent.config.yaml` (git) is the definition + defaults; operator **overrides** live in `state/config/setup.yaml`. Both are read at startup (effective = defaults ⊕ setup), so applying a change needs a restart. The marketplace per-agent Config page edits the overrides via **GUI fields** — model, the HITL toggle, and connected systems (Connect buttons), no raw JSON — by writing `setup.yaml` (directly while stopped, or via `POST /admin/setup`), then a **Restart agent** button (`POST /admin/restart`) to apply. Until the operator saves once, the agent stays `awaiting_setup`.

**State & lifecycle** — ALL mutable data lives under `state/` (gitignored), so the git boundary and these operations are mechanical:
- **Restart** — re-read `state/config/`, reload memory/sessions/data, resume any paused HITL run from `state/runs/`.
- **Backup** — `python scripts/agent_state.py backup demos/demo0/agents/agentN` snapshots `state/` minus `index/` (secrets included) with a manifest (versions, timestamp, per-file sha256).
- **Restore** — `git pull` (definition + code) → `python scripts/agent_state.py restore demos/demo0/agents/agentN <backup.zip>` → validates the schema `VERSION`, rebuilds `index/`, restart.
- **Fresh clone, no backup** — boots `awaiting_setup`; configure from the marketplace to go live.

## Key rules

- **Never modify a template** (`agentx_v1_0`, `agentx_v2_0`, or any `agentx_vN_M`) — copy the latest.
- `metadata.yaml status: template` → the platform scanner skips this agent.
- **New agents always copy the latest template version** (highest `agentx_v*` present).
- `main.py` is shared launcher logic — do not customise it per agent.
- Memory backend is at `agentic/memory_backend.py` and stores to `state/memory/` (rules/facts/episodes).
- Strands agent code lives as flat modules in `agentic/` — **no `sub_agents/` folder**.
- All paths come from `agentic/paths.py` (agent-relative; ALL mutable state under `state/`) — no `STORAGE_PATH` env var, no hardcoded paths in other modules.
- `agent.config.yaml` (definition + defaults) is git-tracked; `state/` (incl. `setup.yaml`, secrets) is gitignored and backup-eligible; `seeds/` (test inputs) is git-tracked.
- CORS in `apis/main.py` must allow `:8001` (marketplace) and `frontend_port`.
- Frontend `.env` is written by `main.py` at startup — never hardcode `VITE_API_URL` or `VITE_AGENT_ID`.
- The agent owns **all** its code — tools, sub-agents, prompts, the `Ribbon`, scenarios. No common/shared tool modules; `commons/` holds only `logger.py`.
- Pick the next free ports per `docs/ports.md` and add a row there in the same change.
- No pricing anywhere.
