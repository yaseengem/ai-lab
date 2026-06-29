# AI Lab — Claude Code Rules

## Start here

Read `specs/done/v2-ai-lab-restructure.md` before making any changes — it defines the current structure (AI Lab + demos). `specs/done/v1-platform-restructure.md` is the earlier (now historical) platform spec, kept for context.

---

## Reference docs (always current)

These describe how things are *right now*; `specs/` records *why we decided* things, point-in-time. Keep facts in one place — don't duplicate across layers.

@docs/tech_stack.md
@docs/conventions.md
@docs/architecture.md

---

## What AI Lab is

**AI Lab** is the umbrella project. It hosts independent **demos** under `demos/`:

- **demo0 — "AI Agents Squad"**: the agent platform — a marketplace frontend, a scanner backend (`app/`), and a set of AI agents. This is the entire original system, self-contained.
- **demo1, demo2, … (future)**: other demos that are **not** agent-based (e.g. Human in the Loop, Fleet Management).
- **demo5 (future)**: cross-agent observability.

The top-level `frontend/` is the **AI Lab landing page** — it lists all demos and links to each.

```
ai-lab/
├── config.yaml          # AI Lab: launcher port + demos manifest
├── frontend/            # AI Lab landing page (:5000)
├── scripts/             # orchestrator — starts launcher + delegates into demo0
└── demos/
    └── demo0/           # "AI Agents Squad" — self-contained
        ├── config.yaml  # squad ports + defaults (read by app/config.py)
        ├── .env         # squad secrets
        ├── app/         # scanner backend (:8002)
        ├── commons/     # logger.py only
        ├── frontend/    # marketplace UI (:8001)
        └── agents/      # agent1 … agentN, agentx_v1_0 (template)
```

---

## Spec-first process

- Any new feature needs a spec file in `specs/` with status `approved` before code is written.
- Copy `specs/_template.md` to start a new spec.
- `specs/backlog/` holds drafted specs not yet scheduled — the product roadmap.
- When creating a plan in plan mode, use the spec format from `specs/_template.md` and save it to `specs/{slug}.md` in the repo as the first implementation step.
- Never start implementing until the spec status is `approved`.

---

## Architecture rules

- **demo0 is self-contained.** Its backend and agents launch with working directory `demos/demo0`, so Python imports use the `agents.` / `app.` / `commons.` prefixes as if `demos/demo0` were the root.
- `demos/demo0/commons/` holds **only** `logger.py`. Everything else is agent-owned.
- Each agent lives entirely in `demos/demo0/agents/{agentN}/` — no agent code outside its folder.
- Platform logic (agent list, config, health API) lives in `demos/demo0/app/`.
- Memory backend lives in each agent's `agentic/memory_backend.py` — not in commons.
- A new non-agent demo is a sibling folder `demos/demoN/` — keep it self-contained too.

---

## Port conventions

| Layer | Port |
|-------|------|
| AI Lab launcher (top-level `frontend/`) | 5000 |
| demo0 marketplace frontend | 8001 |
| demo0 backend (`app/`) | 8002 |
| Agent frontends | `80N0` (agent1 → 8010, agent2 → 8020, …) |
| Agent backends (FastAPI) | `80N1` (agent1 → 8011, agent2 → 8021, …) |
| Non-agent demos (`demoN`) | `9N00` (demo1 → 9100, demo2 → 9200, …) |

Agent ports are declared in each agent's `metadata.yaml` (`api_port`, `frontend_port`). Squad/launcher ports live in `demos/demo0/config.yaml` and the root `config.yaml`.

The table above is the *scheme*; **`docs/ports.md` is the living registry of every port actually assigned**. When adding an agent or demo, pick the next free ports per the scheme and add a row to `docs/ports.md` in the same change.

---

## Naming conventions

- Agent folders are `agent1`, `agent2`, `agent3` — **never** named after their use case.
- Display names come from `metadata.yaml` (`name` field).
- Template folders are `agentx_vN_M` and are **versioned**. The **latest** is `agentx_v2_0` (template version 2.0); `agentx_v1_0` is frozen for reference. Future versions live alongside as `agentx_v3_0`, etc. Underscores keep the folder name a valid Python module path so `entry_point` works after a copy.
- Demo folders are `demo0`, `demo1`, … `demoN` under `demos/`.

---

## agentx — the agent template (versioned; latest is v2.0)

- Templates are **versioned** (`agentx_vN_M`). The **latest is `agentx_v2_0`** — **new agents always copy the latest template version**. `agentx_v1_0` is frozen for reference.
- **Never modify a template. Never start a template.** Applies to `agentx_v1_0`, `agentx_v2_0`, and any future version.
- `agentx_vN_M/metadata.yaml` has `status: template` — the scanner skips ANY agent whose status is `template`, regardless of folder name. Don't rely on a folder-name check; the test in `demos/demo0/app/tests/test_scanner_template_skip.py` enforces this.
- Every agent's `metadata.yaml` carries `template_version: "X.Y"` recording which template version it inherits from. Set it when you copy the template; don't change it later.
- To add a new agent (run from `demos/demo0`):
  1. `cp -r agents/agentx_v2_0 agents/agentN` (the latest template)
  2. Update `metadata.yaml`: name, description, `card_description` (≤140 chars), `icon`, `version` (semver), use_case, domain, `api_port` (`80N1`), `frontend_port` (`80N0`), set `status: stub`, set `entry_point: agents.agentN.apis.main:app`, keep `template_version: "2.0"`.
  3. Find-and-replace `agents.agentx_v2_0.` → `agents.agentN.` in the new folder's Python imports.
  4. Pick the next free `80N0`/`80N1` ports per `docs/ports.md` and **add a row to `docs/ports.md`** in the same change.

### v2.0 standard (what every new agent ships)

Must-have pages (Persona gate → **Chat** default landing → Command Center, Memory, Architecture, Processing, Test Runner, Config) inside a **standard ribbon**; **personas** declared in `agent.config.yaml`; **operations-aware chat**; full **scenario-based self-test** (Test Runner + `/test` API + seed generator); the **canonical API contract** (health/identity/chat/sessions/processing/HITL/memory/test/admin); **startup self-check** via `/ping`; `events.jsonl` + SSE resumable output; **HITL approval** (config-toggleable, endpoints always present); **capabilities manifest** + bundled `architecture.md` (≤1000 words + Mermaid); **config split** (`agent.config.yaml` = git-tracked definition + defaults; operator overrides → `state/config/setup.yaml`, edited at platform level via GUI fields — model, HITL toggle, connected `integrations`) with `POST /admin/setup` + `POST /admin/restart`, and **`awaiting_setup`** when no setup yet; **all mutable state under `state/`** (gitignored, backup-eligible via `scripts/agent_state.py`) incl. **per-agent `state/logs/` only**; **durable HITL** (paused runs survive restart); **no pricing** anywhere. Details: `demos/demo0/agents/agentx_v2_0/GUIDELINES.md`; rationale: `specs/done/agentx-v2-template.md` + `specs/active/per-agent-state-layout.md`.

---

## UI rules

- **Light theme only.** CSS variables in `demos/demo0/frontend/src/index.css` are the source of truth — copy them into the AI Lab launcher and each agent's `index.css`.
- `wireframes/` is the design source of truth for all pages.
- Never introduce dark backgrounds or override the light theme variables.

---

## Agent frontends

- Each `demos/demo0/agents/agentN/frontend/` is a **standalone Vite project** with its own `package.json`.
- Reference shared components via `@shared` alias → `../../../frontend/src` (the demo0 marketplace frontend).
- `VITE_API_URL` is written by `agents/agentN/main.py` before Vite starts — **never hardcode it**.
- Each agent's `main.py` also sets `VITE_AGENT_ID` to the folder name (e.g. `agent1`).

---

## app/ extension pattern (demo0)

Adding a new platform feature (in `demos/demo0/app/`):
1. Create `app/routers/{domain}.py` with an `APIRouter`
2. Create `app/services/{domain}_service.py` for business logic
3. Add schemas to `app/schemas/` if needed
4. Register in `app/main.py` — **one line**: `app.include_router({domain}.router, prefix="/api")`

---

## scripts/

- Root `run.sh` starts the AI Lab launcher (:5000), then the demo0 backend (:8002) and marketplace (:8001), then scans `demos/demo0/agents/*/metadata.yaml`, skips `status: template`/`stub`, and calls each agent's `main.py` with working directory `demos/demo0`.
- `run.sh` validates for port conflicts before launching anything.
- Log files go to `demos/demo0/agents/{name}/state/logs/` — never to a root `logs/` folder.
