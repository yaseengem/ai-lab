# Spec: AI Lab restructure — demo0 = AI Agents Squad
**Status:** approved
**Version:** v2
**Date:** 2026-06-19
**Owner:** Yaseen Mohammed

---

## Problem

The repo was built as a single product — **"Neural / Neural AI Agents"** — one marketplace frontend (`frontend/` :5000) plus a platform backend (`app/` :5001) that scans an `agents/` folder (`demo1`…`demo4`, template `demox_v1_0`).

We are repositioning the project as **"AI Lab"**: an umbrella that hosts multiple independent **demos**, of which the current agent marketplace is only the first. We need room to add non-agent demos (Human-in-the-Loop, Fleet Management, cross-agent observability) without entangling them with the agent platform.

---

## Solution

Reposition the whole project as **AI Lab** and nest the entire current system inside a single demo, **demo0 ("AI Agents Squad")**:

- `frontend/`, `app/`, `commons/`, and `agents/` all move under `demos/demo0/`.
- Inner agent folders are renamed `demoN → agentN` (template `demox_v1_0 → agentx_v1_0`).
- A **new top-level `frontend/`** is created: the AI Lab landing page that lists all demos.
- Future non-agent demos live as siblings: `demos/demo1/`, `demos/demo2/`, …

demo0 is **self-contained**: its backend + agents launch with working directory `demos/demo0`, so Python imports keep the `agents.` prefix and only the segment changes (`agents.demo1.` → `agents.agent1.`). `app/config.py`'s `_REPO_ROOT = Path(__file__).parent.parent` resolves correctly once `app/` lives at `demos/demo0/app/`.

The original "rename `agents/` → `demos/`" idea (raised in discussion) is **superseded** by this nesting.

### Target structure

```
ai-lab/
├── config.yaml                  # AI Lab: launcher port + demos manifest
├── requirements.txt  .env  .gitignore
├── specs/  wireframes/  schemas/  docs/
├── scripts/                     # AI Lab orchestrator (delegates into demo0)
├── frontend/                    # NEW — AI Lab landing page, lists all demos (:5000)
└── demos/
    └── demo0/                   # "AI Agents Squad" — the entire current app
        ├── app/                 # platform backend (scanner)            (:8002)
        ├── commons/             # logger
        ├── frontend/            # the current marketplace UI            (:8001)
        └── agents/
            ├── agent1/          # was demo1 (Calvin, active)
            ├── agent2/          # was demo2 (Arvo, stub)
            ├── agent3/          # was demo3 (Lance, stub)
            ├── agent4/          # was demo4 (Settlement, active)
            └── agentx_v1_0/     # was demox_v1_0 (template)
```

---

## Scope

### In scope
- Rebrand "Neural" / "Neural AI Agents" → **"AI Lab"** (slugs use `ailab`). demo0 display name = "AI Agents Squad".
- Move `frontend/`, `app/`, `commons/`, `agents/` under `demos/demo0/` (via `git mv`).
- Rename inner agents `demoN → agentN`, template → `agentx_v1_0`; fix all module paths, `entry_point`s, and `@shared` aliases.
- New top-level AI Lab launcher frontend listing demos (demo0 active; demo1/demo2 "Under Development").
- New port scheme (see below); root `config.yaml` with a `demos:` manifest; root `scripts/` orchestrator.

### Not in scope
- Building demo1 (Human in the Loop) or demo2 (Fleet Management) functionality — placeholders only.
- demo5 (cross-agent observability) — future spec.
- Auth, database, deployment changes.

---

## Architecture impact

### Ports (new scheme)

| Service | Frontend | API |
|---|---|---|
| AI Lab launcher (top) | 5000 | — |
| demo0 — AI Agents Squad | 8001 | 8002 (`app/` scanner backend) |
| agent1 | 8010 | 8011 |
| agent2 | 8020 | 8021 |
| agent3 | 8030 | 8031 |
| agent4 | 8040 | 8041 |
| demo1 — Human in the Loop *(under dev)* | 9100 | — |
| demo2 — Fleet Management *(under dev)* | 9200 | — |
| demo3 *(future)* | 9300 | — |

Pattern: `agentN` → frontend `80N0`, api `80N1`; `demoN` → `9N00`.

- New top-level `frontend/` (AI Lab launcher); no new backend (data-driven from `config.yaml` `demos:` manifest).
- `commons/logger.py` moves under demo0 (used only by agents).
- `@shared` alias in each agent frontend repoints to `demos/demo0/frontend/src` (`../../../frontend/src`).

---

## Implementation Checklist

- [x] Phase 1: Write this spec; rewrite `CLAUDE.md` for the new structure, naming, ports.
- [x] Phase 2: `git mv` `frontend/`, `app/`, `commons/`, `agents/` → `demos/demo0/`; rename `demoN → agentN`, `demox_v1_0 → agentx_v1_0`.
- [x] Phase 3: Fix Python module paths (`agents.demoN.` → `agents.agentN.`), `entry_point`s, schema example. (agentN/main.py repo-root needed no change — `parent.parent` already resolves to `demos/demo0`.)
- [x] Phase 4: Repoint `@shared` aliases; `platform.ts` API URL → :8002; new metadata ports; agent CORS `_PLATFORM_ORIGIN` → :8001.
- [x] Phase 5: Rebrand Neural → AI Lab (config, scripts, React UI, package names, titles).
- [x] Phase 6: New AI Lab launcher frontend (lists demos; demo1/demo2 "Under Development").
- [x] Phase 7: Root `config.yaml` + `scripts/run|stop|check.sh` orchestrator; fix `.claude/settings.local.json`, `.gitignore`, tests.

> Note: `docs/architecture.md` is a pre-v1 historical design doc (references `agents/claims`, `storage/`, `/opt/ai-agents`) and was already stale before this change; left untouched. README and specs are the current source of truth.

---

## Verification

1. `./scripts/run.sh` — no port conflicts; launches AI Lab launcher (:5000), demo0 backend (:8002), marketplace (:8001), agents (8010/8011, 8040/8041).
2. `http://localhost:5000` — landing shows demo0 "AI Agents Squad" (active) + demo1/demo2 "Under Development"; demo0 card opens :8001.
3. `GET http://localhost:8002/api/agents` → agent1/agent2/agent4; `GET /api/health` → correct `agents_found`.
4. `http://localhost:8001` — marketplace loads agent cards from :8002.
5. `http://localhost:8010` — agent1 (Calvin) frontend loads; `@shared` CSS resolves.
6. `cd demos/demo0 && pytest agents/agent1/tests/` and `pytest app/tests/` pass.
7. UI shows "AI Lab" everywhere; no stray "Neural" in shipped UI.
