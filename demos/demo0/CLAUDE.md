# demo0 — "AI Agents Squad" — Claude Code Rules

> Scoped rules for `demos/demo0/`. The root `../../CLAUDE.md` and `docs/` still apply — this file adds demo0-specific emphasis and does not override the root.

## Agents are fully self-contained — no common tools

**Every agent owns all of its own code.** Tools, sub-agents, prompts, frontend components (including the standard `Ribbon`), test scenarios, and seed data live entirely inside that agent's own folder `agents/agentN/`. There are **no common/shared tool modules**, and none may be introduced.

- ❌ Do not create a shared `tools/` package, a shared components library, or any module that multiple agents import for behaviour.
- ✅ When two agents need the same capability, **copy the pattern** into each agent. Duplication across agents is intentional — independence and portability win over DRY here.
- `commons/` holds **only `logger.py`** (logging infrastructure — not a tool). Nothing else belongs there.
- Each agent's tools live in `agents/agentN/agentic/tools/`; the memory backend in `agents/agentN/agentic/memory_backend.py`. Strands agent code (the top-level agent and any specialist sub-agents) lives as **flat modules directly in `agentic/`** — there is no `sub_agents/` folder in the v2.0 template.

This keeps any agent copyable, deletable, and runnable on its own without dragging in shared code.

## New agents use the latest template

Create new agents from the **latest** `agentx_vN_M` template — the highest-versioned `agentx_v*` folder present. Today that is `agentx_v2_0` (now built); `agentx_v1_0` is frozen for reference. Never modify or start a template folder. See the root `CLAUDE.md` for the copy steps.

### v2.0 template standards

Every agent copied from `agentx_v2_0` ships, at minimum:

- **Must-have pages** — Persona gate → **Chat** (default landing) → Command Center, Memory, Architecture, Processing, Test Runner, Config.
- **Standard ribbon** — single `Ribbon` component (top bar + persona-filtered left nav), copied per agent, light theme only.
- **Personas** declared in `agent.config.yaml` (the entry point), driving visible pages — a chosen view, not auth.
- **Operations-aware chat** answering about runs, memory/rules, config, status, and outcomes.
- **Scenario-based self-test** — `data/test_scenarios/*.json` + `/test` API + Test Runner page + `create_dummy_data.py`.
- **Canonical API contract** — health/identity/chat/sessions/processing/HITL/memory/test/admin (contract-tested).
- **Config edited at platform level** + `POST /admin/restart` to reload `agent.config.yaml`.
- **Per-agent `logs/` only**; `events.jsonl` + SSE resumable output; startup self-check via `/ping`.
- **No pricing** anywhere.

Full details and the create steps: `agents/agentx_v2_0/GUIDELINES.md`. Rationale: `specs/active/agentx-v2-template.md`.
