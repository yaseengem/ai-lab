# Spec: Agent Template v2.0 (`agentx_v2_0`)

**Status:** in-progress
**Version:** v1
**Date:** 2026-06-23
**Owner:** Yaseen Mohammed
**Scope:** New `demos/demo0/agents/agentx_v2_0/` template + supporting platform (`app/`) and schema changes. `agentx_v1_0` and all existing agents (`agent1`–`agent4`) untouched except for the standing "use latest template" rule documentation.

---

## Problem

`agentx_v1_0` is a backend-only skeleton — the `frontend/` is described in `GUIDELINES.md` but not shipped, so every new agent reinvents its UI, navigation, personas, testing, and config from scratch. `agent1` (claims) and `agent4` (settlement) have diverged into completely different page sets and capabilities. There is no standard for:

- **What pages an agent must have**, or a **standard ribbon / navigation** shared across them.
- **Personas** — `agent1` has a `RoleSelectPage` with hardcoded roles; `agent4` has none. No consistent "who am I / what can I see" entry point.
- **Self-test / demo** — `agent4` has a scenario-based Test Runner; `agent1` has a seed-data generator; nothing is mandated, so a new agent isn't guaranteed to be runnable or demonstrable end-to-end.
- **A standard API contract** — only `/ping` is enforced (by the scanner); everything else differs per agent.
- **Config** — there is no agent-level config file. You cannot view or edit an agent's configuration while it is stopped (its own API on `80N1` is down).
- **Card hygiene** — `metadata.yaml` `description` has only a comment-block guideline; nothing enforces length, so marketplace cards render at uneven heights. Icon and version conventions are informal.

We need a v2.0 full-stack template that bakes these in as the standard, and a rule that **every new agent copies the latest template version**.

---

## Solution

Create `demos/demo0/agents/agentx_v2_0/` — a full-stack template (backend + a standalone Vite frontend) whose frontend ships a fixed set of **must-have pages** wrapped in a **standard ribbon**, whose entry point is **persona selection**, and which mandates a **full self-test/demo harness**, a **standard API contract**, a **startup self-check**, **resumable live output**, **HITL approval**, and a **capabilities manifest**. Add an agent-level **config file** (`agent.config.yaml`) that the demo0 platform backend (`app/`) can read and write **even when the agent process is stopped**. Tighten `metadata.yaml` (and its schema) to mandate a length-bounded card description, an icon, and a semver version. Codify "new agents use the latest template version" in `CLAUDE.md` and `GUIDELINES.md`.

`agentx_v2_0` is the new latest template. `agentx_v1_0` stays frozen for reference. Both keep `status: template` so the scanner skips them.

---

## Scope

### In scope

- **New template folder** `demos/demo0/agents/agentx_v2_0/` with `metadata.yaml` (`template_version: "2.0"`, `status: template`), `agent.config.yaml`, `GUIDELINES.md`, `agentic/`, `apis/`, a real `frontend/`, `data/`, `create_dummy_data.py`, `tests/`.
- **Standard must-have pages** (see table) inside a **standard ribbon** component.
- **Persona model**: personas declared in `agent.config.yaml`; persona-select screen is the start point; selected persona drives which ribbon items / pages are visible.
- **Full self-test / demo harness** (agent4-grade): JSON scenario files with expected-outcome assertions + a `/test` API + a Test Runner page + a seed-data generator.
- **Standard API contract**: every agent exposes a canonical endpoint set, verified by a platform contract test.
- **Startup self-check**: agent validates its config/env on boot and reports readiness via `/ping` + Command Center.
- **Resumable live output**: `events.jsonl` + SSE replay so the Processing page survives a refresh.
- **HITL approval** (config-toggleable) + **capabilities manifest** rendered on the Architecture page.
- **Agent config file** `agent.config.yaml` and a platform-side read/write API that works **while the agent is stopped**, surfaced in a **per-agent Config page** in the marketplace.
- **Restart**: every agent exposes a `POST /admin/restart` capability; the platform Config page has a **Restart agent** button (and restarts the agent after a config change so it reloads).
- **Per-agent logs**: each agent writes to its own `logs/` directory (sibling of `agentic/`), never to a shared/root log folder.
- **metadata.yaml standards**: bounded `card_description` (140 chars), required `icon`, semver `version`; enforced in `schemas/agent-metadata.schema.json` and validated by the scanner.
- **Remove pricing**: the template ships **no** pricing page, field, or copy; the standard explicitly forbids pricing in agent UIs.
- **Self-contained, no common tools**: every agent owns all its tools, sub-agents, prompts, components, and scenarios inside its own folder; the template never introduces shared tool modules. `commons/` stays limited to `logger.py`.
- **Port assignment + registry**: creating a new agent from the template picks the **next free** `80N0`/`80N1` ports and **adds a row to `docs/ports.md`** in the same change. A new `docs/ports.md` is the living registry of every assigned port.
- **Docs**: `CLAUDE.md`, `docs/conventions.md`, `GUIDELINES.md` updated with the v2.0 standard and the "always use latest template" rule.

### Not in scope

- Migrating `agent1`–`agent4` onto the v2.0 template (separate follow-up specs).
- New AI/agentic capabilities, tools, or sub-agents — `agentic/` stays a minimal working skeleton (parity with v1.0 depth) plus a standard approval hook.
- Multi-worker / multi-host deployment (single-worker constraint stays — HITL futures live in-memory).
- Authentication. Personas are a chosen view, not a security boundary — consistent with the demo's no-auth design.
- AgentCore migration.

---

## Architecture impact

> **Self-containment principle.** Every agent owns **all** of its code — tools, sub-agents, prompts, frontend components (including the `Ribbon`), and test scenarios live entirely inside `demos/demo0/agents/agentN/`. There are **no common/shared tool modules**. Where this spec says a capability is "modeled on" or "copied from" another agent (e.g. the test harness, `events.jsonl`/SSE, the ribbon), it means **copy the pattern into the new agent**, never import from a shared location. `demos/demo0/commons/` continues to hold **only `logger.py`** (logging infrastructure, not a tool).

### A. New template folder layout

```
demos/demo0/agents/agentx_v2_0/
├── metadata.yaml            # template_version "2.0", status template, bounded card_description, icon, semver version
├── agent.config.yaml        # NEW — personas, defaults, features, capabilities (see C)
├── main.py                  # starts API + frontend (v1.0 pattern, imports rewritten)
├── GUIDELINES.md            # v2.0 instructions (remove on copy)
├── agentic/                 # all AI code as flat modules — NO sub_agents/ folder
│   ├── agent.py             # top-level Strands agent + run_chat()
│   ├── model.py             # Bedrock model client
│   ├── prompts.py           # system prompt strings
│   ├── memory_backend.py    # LocalMemoryStore
│   ├── approval_hook.py     # standard HITL hook (config-toggleable)
│   └── tools/               # @tool functions
├── apis/
│   ├── main.py              # FastAPI app, CORS (allow :8001 + own frontend_port)
│   ├── routes.py            # canonical endpoints (see F); /ping carries startup self-check
│   ├── test_routes.py       # /test/scenarios, /test/scenarios/{id}/data, /test/run/{id}
│   ├── service.py           # run lifecycle + events.jsonl + SSE queue
│   └── schemas.py
├── frontend/                # standalone Vite + React + TS
│   └── src/
│       ├── App.tsx          # ribbon shell + persona gate + routes
│       ├── components/Ribbon.tsx
│       ├── config/personas.ts
│       └── pages/           # the must-have pages (see B)
├── architecture.md          # one-page agent architecture (≤1000 words, includes a Mermaid diagram) — served by GET /architecture
├── data/{dummy,test_scenarios,cases,sessions,memory}/
├── create_dummy_data.py     # seed/demo data generator (pattern from agent1)
├── logs/                    # this agent's logs only — sibling of agentic/, never a shared/root logs dir (gitignored)
└── tests/
```

**No `sub_agents/` folder.** Strands agent code lives as flat modules in `agentic/`: `agent.py` is the top-level agent, and any specialist sub-agents an agent needs are added as sibling modules (e.g. `agentic/fraud_agent.py`) — not nested in a subfolder. The v1.0 template's empty `sub_agents/` placeholder is dropped in v2.0.

### A.1 Parity with v1.0 — everything v1.0 ships is carried over

v2.0 is a strict **superset** of v1.0; nothing v1.0 provides is removed (only `sub_agents/` placeholder is dropped). The implementation must preserve, verbatim where noted:

- **All `metadata.yaml` fields** — `name`, `description`, `use_case`, `domain`, `api_port`, `frontend_port`, `entry_point`, `api_version`, `status`, `version`, `template_version`. v2.0 only **adds** `card_description` + `icon`. The 4–6-sentence description-writing guideline comment block stays.
- **`main.py` launcher behaviour (verbatim)** — reads `metadata.yaml`; writes `frontend/.env` with `VITE_API_URL` + `VITE_AGENT_ID` before Vite starts; launches `uvicorn … --reload`; launches `vite dev` only if `package.json` exists; graceful shutdown on `KeyboardInterrupt`. Shared logic — not customised per agent.
- **`apis/main.py`** — repo-root `sys.path` injection; `commons.logger.setup_logging()`; FastAPI app titled/versioned/described from `metadata.yaml`; CORS allowing the platform origin `:8001` + own `frontend_port` (plus their `127.0.0.1` variants); `include_router`.
- **`GET /ping`** — required by the scanner (now enhanced to carry the startup self-check status).
- **`agentic/agent.py`** — top-level Strands `Agent` + `run_chat()` async generator streaming SSE `text-delta` then `done`.
- **`agentic/model.py`** — `BedrockModel` reading `bedrock_model_id`/`aws_region` from the root `config.yaml` `defaults`, overridable via `BEDROCK_MODEL_ID` / `AWS_REGION` env vars.
- **`agentic/memory_backend.py`** (LocalMemoryStore), `agentic/tools/`, `tests/` package, and `.gitignore` (logs gitignored) — carried over (and surfaced by the Memory page / self-test).

> Note: v1.0's `GUIDELINES.md` folder map lists `frontend/`, `data/`, `prompts.py`, `memory_backend.py`, but the actual v1.0 folder ships none of them — they were aspirational. v2.0 makes them real.

### B. Must-have pages (the v2.0 standard)

Every page renders inside the **standard ribbon**. Persona selection is the **start point** — no page is reachable until a persona is chosen.

| # | Page | Route | Purpose | Persona-gated |
|---|------|-------|---------|---------------|
| 0 | **Persona Select** | `/` (gate) | **Start point.** Selecting an agent in the Agent Squad marketplace loads the agent and shows this persona picker for the demo; choosing a persona routes straight to **Chat**. Cards show each persona's icon, label, "what you can see". | always shown |
| 1 | **Command Center** | `/home` | Dashboard — status tiles, recent runs, startup self-check / readiness, quick actions. Reachable from the ribbon (not the default landing). | yes |
| 2 | **Chat** | `/chat` | **Default landing after persona select.** SSE streaming, persona-aware. Answers free conversation **and questions about all agent operations** — runs/cases, memory/rules, config, status, processing outcomes (see §B.1). | yes |
| 3 | **Processing** | `/processing` | Trigger + watch a run; resumable live output (survives refresh); HITL approval surface. | yes |
| 4 | **Memory** | `/memory` | View what the agent stored in memory (rules / preferences / LTM). | yes |
| 5 | **Architecture** | `/architecture` | One-page architecture: a bundled `architecture.md` (**≤ 1000 words, must include a Mermaid diagram**) rendered on the page, plus the capabilities manifest. | yes |
| 6 | **Test Runner** | `/test-runner` | Lists demo/test scenarios; runs any of them live; shows pass/fail vs expected. | yes |
| 7 | **Agent Config** | `/config` | View `agent.config.yaml` (read-only in the agent UI; authoritative edit at platform level — see E). | admin-type personas |

**Explicitly removed:** no pricing page, tile, field, or copy anywhere. The standard forbids pricing in agent UIs.

### B.1 Entry flow + operations-aware chat (standard)

**Entry flow.** Agent Squad marketplace → click an agent → the agent's app loads at `/` (persona gate) → pick a persona (the demo's viewpoint) → land on **Chat** (`/chat`). Command Center and the other pages are reached from the ribbon; Chat is the default destination so every agent opens "ready to talk".

**Operations-aware chat.** Chat is not just free conversation — it can answer questions about **all of the agent's operations**, scoped to the active persona. It must be able to address, at minimum:
- **Runs / cases** — "what's the status of RUN-…?", "why was case X rejected?", "list recent runs".
- **Memory / rules** — "what rules are active?", "what has the agent remembered?".
- **Config** — "which model is this agent using?", "is HITL approval on?".
- **Status / readiness** — "is the agent healthy?", surfacing the startup self-check.
- **Processing outcomes** — explain a completed run's decision and audit trail.

This is implemented by giving the chat agent read-access tools over the agent's own state (sessions/`events.jsonl`, memory backend, `agent.config.yaml`, `/ping` self-check) — all agent-owned, no shared modules. Write actions (e.g. changing rules) stay gated to admin-type personas, consistent with the existing role-aware design.

### C. Personas, capabilities & `agent.config.yaml`

A new **agent-level config file** `agent.config.yaml` (sibling of `metadata.yaml`) holds runtime, human-editable configuration — distinct from `metadata.yaml`, which stays identity/discovery only.

```yaml
# agent.config.yaml (template defaults)
personas:
  - { id: end_user,     label: Customer,      icon: "👤", description: "Submit requests and track your own cases.", visible_pages: [home, chat, processing],                                  default_landing: chat }
  - { id: support_exec, label: Support,       icon: "🎧", description: "Look up and explain any case.",            visible_pages: [home, chat, processing, memory, test-runner],               default_landing: chat }
  - { id: admin,        label: Administrator, icon: "⚙️", description: "Everything support can do, plus config.",    visible_pages: [home, chat, processing, memory, architecture, test-runner, config], default_landing: chat }
defaults:
  model_id: ""          # blank = inherit BEDROCK_MODEL_ID
features:
  hitl_approval: true
capabilities:           # rendered on the Architecture page
  tools: []
  can: []
  cannot: []
```

- The **persona-select page** reads `personas`, renders one card per persona; choosing one stores it (sessionStorage) and routes to its `default_landing` — **`chat` by default**, so every agent opens on the Chat interface.
- The **ribbon** shows only the pages in the chosen persona's `visible_pages`.
- `capabilities` renders on the Architecture page so the agent self-documents.
- The agent's `apis/` exposes `GET /config` and `GET /personas`; the frontend's `config/personas.ts` fetches these.

### D. Self-test / demo harness (Full — agent4-grade)

Modeled on `demos/demo0/agents/agent4/apis/test_routes.py` + `TestRunnerPage.tsx`:

- `data/test_scenarios/*.json` — each scenario has `id`, `name`, `description`, `tags`, mock input data, and an `expected` block (expected counts / outcomes / assertions).
- `apis/test_routes.py` — `GET /test/scenarios`, `GET /test/scenarios/{id}/data`, `POST /test/run/{id}` (injects mock data, starts a **real** run, returns `session_id`); `init_service(service)` wiring as in agent4.
- **Test Runner page** — lists scenarios, runs them, streams live output, shows **pass/fail vs `expected`**.
- `create_dummy_data.py` — seed/demo data generator (pattern from `agent1`).

Result: every agent is runnable end-to-end with zero external setup and demonstrates itself in multiple ways.

### E. Platform config page + restart

Config is edited at the platform level (so it works even when the agent's own API on `80N1` is down), and the platform can **restart the agent to apply the new config**. Two layers:

**Agent-level restart capability (every agent provides it).** Each agent exposes a standard, admin-gated `POST /admin/restart` endpoint that triggers a graceful self-restart so the agent re-reads `agent.config.yaml` (re-exec via `os.execv`, or exit-for-supervisor — mechanism is an implementation detail). This is part of the canonical API contract (§F): restarting is a first-class agent capability, not a platform hack.

**Platform config page (`app/` + marketplace).** Following the `app/` extension pattern:
- `app/routers/agent_config.py` (`APIRouter`) + `app/services/agent_config_service.py`:
  - `GET /api/agents/{id}/config` — read `agent.config.yaml` from disk (works regardless of process state).
  - `PUT /api/agents/{id}/config` — validate + write (file-locked via `filelock`, already a dependency).
  - `POST /api/agents/{id}/restart` — restart the agent: if running, call its `POST /admin/restart`; if stopped, (re)launch it via the orchestrator. Reports running/stopped state.
- Register the router in `app/main.py` (one line).
- **Marketplace** gains a **per-agent Config page** (on `AgentDetailPage`) with the config-edit options **and a "Restart agent" button alongside them**. Config edit is usable while the agent is offline; after a `PUT`, the page prompts to restart so the change takes effect.

### F. Standard API contract

Every agent exposes this canonical set — **mandatory for all agents**, verified by a platform contract test:

| Group | Endpoint | Purpose |
|-------|----------|---------|
| Health | `GET /ping` | Returns `{status, agent, version}`; `status` = startup self-check (`ok \| degraded` + reasons). |
| Identity | `GET /config`, `GET /personas`, `GET /architecture` | Expose `agent.config.yaml`, personas, and the architecture doc to the frontend. |
| Chat | `POST /chat/{session_id}` (SSE) | Operations-aware, persona-aware streaming chat. |
| Sessions | `GET /sessions`, `GET /sessions/{id}` | List + fetch run/case history. |
| Processing | `POST /run`, `GET /monitor/{id}` (SSE) | Trigger work; stream live output (events.jsonl replay + live). |
| HITL | `POST /approve/{id}`, `POST /reject/{id}` | Approve/reject a paused run. **Always present**; return a clear "approvals disabled" response when `features.hitl_approval` is false. |
| Memory | `GET /memory` | Read agent memory (rules / LTM) for the Memory page + chat. |
| Test | `GET /test/scenarios`, `GET /test/scenarios/{id}/data`, `POST /test/run/{id}` | Scenario-based self-test/demo. |
| Admin | `POST /admin/restart` | Graceful self-restart to reload `agent.config.yaml` (called by the platform). |

Decisions: processing uses **`POST /run` + SSE `GET /monitor/{id}`** (no `/process` alias). HITL endpoints are **always present but inert** when `features.hitl_approval` is false — keeps the contract uniform and the contract test simple.

### G. Startup self-check

On boot the agent validates its own config/env (Bedrock creds, resolved model id, `agent.config.yaml` parse) and exposes readiness via `/ping`. The Command Center renders readiness so a misconfigured agent explains *why* instead of silently failing.

### H. Runs + resumable live output

Adopt agent4's `events.jsonl` append-only log + SSE replay-from-cursor (`Last-Event-ID`) so the Processing page replays history then continues live after a refresh. Reuses the pattern in `specs/done/runs-subsystem-and-template-versioning.md`.

### I. Standard ribbon

A single `Ribbon` component (top bar + left nav), copied into each agent and kept visually identical:

- **Top bar**: agent icon + name + version; current persona + "switch persona" (returns to the gate); a live agent-status dot.
- **Left nav**: the must-have pages filtered to the active persona's `visible_pages`, grouped into standard sections.
- Light theme only — shared CSS variables from `demos/demo0/frontend/src/index.css` per the UI rules.

### J. `metadata.yaml` standards + schema

Tighten `schemas/agent-metadata.schema.json`:

- `card_description` (NEW): marketplace card text — `maxLength` **140** (≈ 24 words) so all cards render uniform height. The free-form `description` stays for the detail page.
- `icon` (NEW, required): emoji or icon key.
- `version`: keep required; document **semver** (`MAJOR.MINOR.PATCH`).
- `template_version`: required for new agents; v2.0 agents set `"2.0"`.
- `app/services/agent_scanner.py` validates `card_description` length + presence of `icon`/`version`, and runs the canonical-endpoint contract check; `app/schemas/agent.py` exposes `card_description`/`icon`; `AgentCard.tsx` renders `card_description`.

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Template lineage | New `agentx_v2_0`, freeze `agentx_v1_0` | Versions coexist; existing agents keep their inherited template |
| Latest-template rule | New agents always copy the **latest** `agentx_vN_M` | One evolving standard; documented in CLAUDE.md + GUIDELINES |
| Config location | New `agent.config.yaml`, separate from `metadata.yaml` | `metadata.yaml` = identity/discovery; config = human-editable runtime |
| Config-while-stopped | Served by platform `app/`, not the agent API | The agent's own API is down when stopped; platform is always up |
| Restart | Every agent exposes `POST /admin/restart`; platform Config page has a Restart button and restarts after config change | Config in `agent.config.yaml` is read at startup, so applying it needs a restart; agents own the restart, platform triggers it |
| Per-agent logs | Each agent writes to its own `agentN/logs/` (sibling of `agentic/`) | Self-contained; no shared/root log folder; matches existing CLAUDE.md rule |
| Personas | Declared in `agent.config.yaml`, drive visible pages | Data-driven, no hardcoded roles; consistent entry point |
| Entry flow | Marketplace → agent → persona gate → **Chat** (default landing) | Every agent opens ready to converse; dashboard is one ribbon click away |
| Chat scope | Operations-aware — answers about runs, memory, config, status, outcomes | Chat is the primary control/observability surface, not just Q&A |
| Persona = view, not auth | No authentication | Matches the demo's no-auth design |
| Self-test harness | Full (agent4-grade): scenarios + `/test` API + Test Runner page + seed generator + assertions | Every agent is runnable & demonstrable end-to-end |
| API contract | Mandated canonical endpoint set + contract test | Consistency; agents become interchangeable to the platform |
| Processing API | `POST /run` + SSE `GET /monitor/{id}` (no `/process` alias) | Single streaming pattern; matches the resumable Processing page |
| HITL endpoints | Always present; inert ("approvals disabled") when `features.hitl_approval` is false | Uniform contract; contract test needn't branch on config |
| Live output | `events.jsonl` + SSE replay | Processing page survives refresh; reuses proven agent4 pattern |
| Card description | Bounded `card_description` (140 chars) | Uniform card heights; enforced in schema + scanner |
| Pricing | Removed entirely; forbidden in standard | Not part of the product; avoids per-agent drift |
| Ribbon | Standard component, copied per agent | Standalone Vite projects can't share at build time; copy keeps them identical |
| Self-containment | Each agent owns ALL its tools, sub-agents, prompts, components, scenarios — no common/shared tool modules | Agents stay independent and portable; `commons/` holds only `logger.py` (logging infra, not a tool) |
| Strands agent code | Flat modules in `agentic/`; no `sub_agents/` folder | Sub-agents are just modules; a dedicated subfolder is needless scaffolding the template's agent doesn't use |
| Port tracking | New `docs/ports.md` registry; new agents take the next free `80N0`/`80N1` and update it | Single living record of assigned ports; prevents collisions; `run.sh` already validates conflicts |
| Architecture page | Bundled per-agent `architecture.md`, ≤1000 words, includes a Mermaid diagram | One scannable page that travels with the agent; Mermaid keeps the diagram in-repo and editable |

---

## Implementation Checklist

### Phase 1 — Spec into repo
- [ ] 1.1 Approve this spec; move to `specs/active/`; update `roadmap.md`.

### Phase 2 — Schema & standards
- [ ] 2.1 Add `card_description` (maxLength 140), required `icon`, document semver in `schemas/agent-metadata.schema.json`.
- [ ] 2.2 `app/services/agent_scanner.py` validates the new fields + canonical-endpoint contract check; `app/schemas/agent.py` exposes `card_description`/`icon`.
- [ ] 2.3 `AgentCard.tsx` renders `card_description`. Regression test for length/icon + contract rules.

### Phase 3 — Template backend
- [ ] 3.1 Scaffold `agentx_v2_0/` from the v1.0 pattern; rewrite imports `agentx_v1_0.` → `agentx_v2_0.`; `metadata.yaml` (`template_version "2.0"`, `status template`, icon, bounded `card_description`).
- [ ] 3.2 `agent.config.yaml` (personas, defaults, features, capabilities) + `apis/` canonical endpoints, `GET /personas`, `GET /memory`, `GET /architecture`, `POST /admin/restart`.
- [ ] 3.3 Startup self-check feeding `/ping`; `events.jsonl` + SSE replay in `service.py`; logging configured to write to this agent's `logs/`.
- [ ] 3.4 `test_routes.py` (`/test/scenarios`, `/test/run/{id}`) + minimal agentic skeleton + standard `approval_hook.py` (config-toggleable); operations-aware chat read-tools (sessions/events, memory, config, `/ping`).

### Phase 4 — Template frontend
- [ ] 4.1 Standalone Vite project; `@shared` alias; `main.py` writes `VITE_API_URL` + `VITE_AGENT_ID`.
- [ ] 4.2 `Ribbon` (top bar + persona-filtered left nav), light theme.
- [ ] 4.3 Persona-select gate at `/`; `config/personas.ts` fetches personas; persona stored + drives nav.
- [ ] 4.4 Must-have pages: Command Center (readiness), Chat, Processing (resumable + HITL), Memory, Architecture (renders bundled `architecture.md` ≤1000 words + Mermaid diagram + capabilities), Test Runner (pass/fail), Agent Config (read-only). No pricing anywhere.
- [ ] 4.5 Add a Mermaid renderer to the agent frontend (the Architecture page) and author the template's `architecture.md` (≤1000 words, one Mermaid diagram).

### Phase 5 — Self-test data
- [ ] 5.1 `data/test_scenarios/*.json` with `expected` blocks.
- [ ] 5.2 `create_dummy_data.py` seed/demo generator.

### Phase 6 — Platform config page + restart
- [ ] 6.1 `app/routers/agent_config.py` + `app/services/agent_config_service.py`: `GET`/`PUT /api/agents/{id}/config` (filelock, works while stopped) + `POST /api/agents/{id}/restart`.
- [ ] 6.2 Restart logic: call the agent's `POST /admin/restart` if running, else (re)launch via the orchestrator; report running/stopped state.
- [ ] 6.3 Register router in `app/main.py`.
- [ ] 6.4 Marketplace per-agent **Config page** (on `AgentDetailPage`): config-edit options + a **Restart agent** button; usable while offline; prompt to restart after a config change.

### Phase 7 — Docs & rule
- [ ] 7.1 `agentx_v2_0/GUIDELINES.md` (v2.0 steps) — including: pick the next free `80N0`/`80N1` ports and add a row to `docs/ports.md`.
- [ ] 7.2 New `docs/ports.md` port registry (launcher, demo0 platform + agents, templates, non-agent demos) with a "next free" marker and an add-an-agent checklist.
- [ ] 7.3 `CLAUDE.md` + `docs/conventions.md`: v2.0 standard (must-have pages, ribbon, personas, self-test, API contract, config file, no pricing, self-containment, port registry) and the **"new agents always copy the latest template version"** rule. Point the root "Port conventions" table at `docs/ports.md`.

---

## Verification

1. **Latest template exists.** `agentx_v2_0/` present; `template_version: "2.0"`, `status: template`; scanner skips it (test passes).
2. **Entry flow → Chat.** From the Agent Squad marketplace, clicking the agent loads it at `/` (persona cards); choosing a persona lands on **Chat** (`/chat`). `end_user` vs `admin` yields different ribbon nav per `visible_pages`; "switch persona" returns to the gate.
3. **Operations-aware chat.** In Chat, ask "list recent runs", "what rules are active?", "which model is this agent using?", "is the agent healthy?" — each returns a correct answer drawn from the agent's own state.
4. **Must-have pages + no pricing.** Command Center, Chat, Processing, Memory, Architecture, Test Runner, Config all reachable per persona; no pricing anywhere.
5. **Self-test harness.** Test Runner lists scenarios from `data/test_scenarios/`; running one streams live output and shows pass/fail vs `expected`; `create_dummy_data.py` produces seed data.
6. **Standard API contract.** Contract test confirms every agent exposes the canonical endpoints; `/ping` returns `{status, agent, version}`.
7. **Startup self-check.** Start with a blank/bad model id → `/ping` reports `degraded` with reasons; Command Center shows the reason.
8. **Resumable output.** Start a run on Processing, refresh mid-run → events replay then live continues.
9. **HITL + capabilities + architecture.** With `hitl_approval: true`, a run pauses at the gate and Escalations shows approve/reject; the Architecture page renders the bundled `architecture.md` with its Mermaid diagram (≤1000 words) plus the `capabilities` block.
10. **Config + restart.** The platform per-agent Config page loads config via `GET /api/agents/{id}/config` (works while stopped); a `PUT` persists to `agent.config.yaml`; clicking **Restart agent** calls `POST /api/agents/{id}/restart`, the agent restarts and reloads the new config (e.g. a changed `model_id` takes effect).
11. **Per-agent logs.** Each agent writes only to its own `agentN/logs/`; no shared/root log folder is created.
12. **Card standards.** A `card_description` over 140 chars fails validation; cards render uniform height with an icon.
13. **No regressions.** `agentx_v1_0` and `agent1`–`agent4` unchanged; marketplace + existing agents still load.

---

## Open questions

- **Mermaid rendering dependency** — the Architecture page renders a Mermaid diagram, which needs a Mermaid renderer in the agent frontend (e.g. `mermaid`, or `react-markdown` + a mermaid plugin). Adding it is a new frontend dependency — confirm under the "no dependency without an approved spec" rule (this spec approves it for the template).
