# Port Registry

**Living reference — kept current.** This file tracks every port actually assigned across AI Lab. The *scheme* (how ports are derived) lives in the root `CLAUDE.md` under "Port conventions"; this file records *what is assigned right now*.

> **Update this file whenever a demo or agent is added, removed, or re-ported.** Creating a new agent from the latest template must pick the next free ports per the scheme **and** add a row here in the same change.

---

## AI Lab (top level)

| Component | Port |
|-----------|------|
| AI Lab launcher (landing page, `frontend/`) | 5000 |

## demo0 — "AI Agents Squad"

| Component | Port |
|-----------|------|
| Marketplace frontend (`demos/demo0/frontend/`) | 8001 |
| Platform backend / scanner (`demos/demo0/app/`) | 8002 |

### demo0 agents

Scheme: agent frontend = `80N0`, agent backend = `80N1` (N = agent number).

| Agent | Display name | Frontend | Backend | Status |
|-------|--------------|----------|---------|--------|
| agent1 | Claim Processing Agent | 8010 | 8011 | active |
| agent2 | Underwriting Agent | 8020 | 8021 | stub |
| agent3 | Loan Processing Agent | 8030 | 8031 | stub |
| agent4 | Settlement Failure Prevention Agent | 8040 | 8041 | active |
| agent5 | Trianz Concierge | 8050 | 8051 | active |
| **next free** | — | **8060** | **8061** | — |

Agent ports are declared in each agent's `metadata.yaml` (`frontend_port`, `api_port`). The 80x0/80x1 band runs 8010–8099.

### Templates (not started — scanner skips `status: template`)

| Template | Frontend | Backend |
|----------|----------|---------|
| agentx_v1_0 | 8099 | 3099 |
| agentx_v2_0 (latest) | 8098 | 3098 |

Templates use placeholder ports outside the live agent sequence so they never collide with real agents.

## Non-agent demos (`demos/demoN/`)

Scheme: `9N00` (demo1 → 9100, demo2 → 9200, …).

| Demo | Name | Port | Status |
|------|------|------|--------|
| demo1 | Human in the Loop | 9100 | under development |
| demo2 | Fleet Management | 9200 | under development |
| **next free** | — | **9300** | — |

---

## Adding a new agent — port checklist

1. Pick the next free agent number N (next is **agent6 → 8060 / 8061**).
2. Set `frontend_port: 80N0` and `api_port: 80N1` in the new agent's `metadata.yaml`.
3. Add the agent's row to the *demo0 agents* table above and advance the **next free** row.
4. `scripts/run.sh` validates for port conflicts at launch — confirm a clean start.
