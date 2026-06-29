# Conventions

**Living reference — kept current.** This is the detailed reference; the *enforced* short rules live in `CLAUDE.md`, and decision history in `specs/done/`.

> See also: [tech_stack.md](tech_stack.md) · [architecture.md](architecture.md).

---

## Naming

- **Agent folders are `agent1`, `agent2`, `agent3` … — never named after their use case.** Display names come from each agent's `metadata.yaml` (`name` field).
- **Demo folders** are `demo0`, `demo1`, … `demoN` under `demos/`. `demo0` is "AI Agents Squad".
- **Template folders** are `agentx_vN_M` (e.g. `agentx_v1_0`) — underscores keep them valid Python module paths so `entry_point` works after a copy.
- **Spec slugs** are kebab-case (e.g. `marketplace-nav-and-filters.md`); architectural specs may carry a `vN-` prefix.

## File layout

- **Each agent is self-contained** in `demos/demo0/agents/agentN/` — no agent code lives outside its folder. Memory backend lives in the agent's `agentic/memory_backend.py`.
- **Definition vs state.** An agent folder splits into git-tracked **definition + code** (`metadata.yaml`, `agent.config.yaml`, code, `seeds/` test inputs) and a gitignored **`state/`** root holding ALL mutable data (config/setup, memory, sessions, data, runs, secrets, index, logs). `agentic/paths.py` is the single source of truth for paths. See [per-agent-state-layout](../specs/active/per-agent-state-layout.md) and the agent's GUIDELINES.
- **`demos/demo0/commons/` holds only `logger.py`.** Everything else is agent-owned.
- **Platform logic** (agent list, config, health) lives in `demos/demo0/app/`.
- A new non-agent demo is a sibling `demos/demoN/` — keep it self-contained too.

## Agent template (v2.0 standard)

Agents are scaffolded from a **versioned** template (`agentx_vN_M`); **new agents always copy the latest version** — today `agentx_v2_0` (`agentx_v1_0` is frozen for reference). The v2.0 template bakes in a full-stack standard so agents stay consistent:

- **Must-have pages** inside a **standard ribbon**: Persona gate → **Chat** (default landing) → Command Center, Memory, Architecture, Processing, Test Runner, Config (admin-only). The `Ribbon` filters pages to the active persona; light theme only.
- **Personas** are the entry point — declared in `agent.config.yaml` (not hardcoded), driving which pages are visible. A persona is a chosen *view*, not an auth boundary (the demo has no auth).
- **Operations-aware chat** — Chat is the primary control/observability surface, answering about runs/cases, memory/rules, config, status/readiness, and processing outcomes, scoped to the persona.
- **Scenario-based self-test** — `seeds/test_scenarios/*.json` (with `expected` blocks) + a `/test` API + a Test Runner page + `create_dummy_data.py`, so every agent runs end-to-end with zero setup. Scenarios are INPUT data fed through the APIs; their artifacts land in `state/`.
- **Canonical API contract** (contract-tested): `GET /ping` (startup self-check — `awaiting_setup | ok | degraded`), `GET /config|/personas|/architecture`, `POST /chat/{id}` (SSE), `GET /sessions[/{id}]`, `POST /run` + `GET /monitor/{id}` (SSE), `POST /approve|/reject/{id}` (always present; inert when HITL is off; gate state durable across restart), `GET /memory`, the `/test/*` endpoints, and `POST /admin/setup` + `POST /admin/restart`.
- **Config split + restart** — `agent.config.yaml` (git) is the definition + defaults; operator **overrides** live in `state/config/setup.yaml`, edited at the **platform level** through **GUI fields** (model, HITL toggle, connected systems — no raw JSON; works while the agent is stopped). Effective config = defaults ⊕ setup. Until setup is saved the agent is **`awaiting_setup`** (up, but refuses to process). The agent exposes `POST /admin/setup` + `POST /admin/restart`; the marketplace Config page has a **Restart agent** button. Connected systems are declared under `integrations` — each renders a Connect button that opens its OAuth page when `auth_url` is set, else a mock toggle.
- **Memory** — three live (no-restart) files under `state/memory/`: `rules.json` (procedural), `facts.json` (semantic), `episodes.jsonl` (episodic).
- **Backup / restore** — `scripts/agent_state.py` snapshots `state/` (minus rebuildable `index/`) with a manifest, and restores it (validate `VERSION`, rebuild `index/`). Restore = `git pull` then lay `state/` back down.
- **Per-agent logs** — each agent writes only to its own `state/logs/`, never a shared/root folder.
- **No pricing** — the template ships no pricing page, field, or copy; pricing is forbidden in agent UIs.
- **Agentic code is flat** — modules live directly in `agentic/` (`agent.py`, `model.py`, `prompts.py`, `memory_backend.py`, `approval_hook.py`, `tools/`); there is **no `sub_agents/` folder**.
- **metadata.yaml standards** — bounded `card_description` (≤140 chars), required `icon`, semver `version`, and `template_version` recording the inherited template.

Steps and the full folder map are in `demos/demo0/agents/agentx_v2_0/GUIDELINES.md`; decision history in `specs/done/agentx-v2-template.md` and `specs/active/per-agent-state-layout.md` (state layout, memory, backup/restore).

## `app/` extension pattern

Adding a platform feature in `demos/demo0/app/`:
1. `app/routers/{domain}.py` with an `APIRouter`
2. `app/services/{domain}_service.py` for business logic
3. Schemas in `app/schemas/` if needed
4. Register in `app/main.py` — **one line**: `app.include_router({domain}.router, prefix="/api")`

## Tests

- **pytest.** Platform tests under `demos/demo0/app/tests/`; agent tests under `demos/demo0/agents/agentN/tests/`.
- Run from `demos/demo0` (working-directory root for imports). No `pytest.ini` — defaults apply.
- The template-skip behaviour is locked by `app/tests/test_scanner_template_skip.py` — don't rely on a folder-name check.

## Status axes (two separate things)

| Axis | Where | Values |
|------|-------|--------|
| **Spec lifecycle** | spec header `Status:` | `draft` → `approved` → `in-progress` → `done` → `superseded` |
| **Agent state** | `metadata.yaml` `status:` | `active` / `stub` / `template` (scanner skips `template`) |

## Golden rule

**No code without an approved spec.** If you can't point to a spec item for a change, write the spec first. See `specs/README.md`.
