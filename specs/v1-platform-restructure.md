# Spec: Platform Restructure + UI Overhaul
**Status:** done
**Version:** v1
**Date:** 2026-05-05
**Owner:** Yaseen Mohammed

---

## Problem

The current codebase has several structural issues that limit scalability:
- Shared utilities scattered across `utils/` and `storage/` (not obviously shared)
- Agent folders named after use cases (`claims/`, `underwriting/`) — tightly coupled identity
- No single place to start or stop a complete agent (frontend + backend separate)
- Logs, memory, and data spread across root-level folders instead of per-agent
- No central platform backend — agent list is hardcoded in the frontend
- No living spec or process — changes are made without a declared intent
- Dark theme UI that does not look professional; wireframes exist but unused

---

## Solution

Restructure the repository around three principles:
1. **Self-contained agents** — every agent owns everything it needs in one folder
2. **Spec-first process** — no feature is built without a spec in `specs/`
3. **Dynamic platform** — a central backend (`app/`) serves live data by scanning agent folders

---

## Scope

### In scope
- Folder restructure (commons, demo1/2/3/demox, specs, app/)
- Central platform backend (`app/`) with extensible router/service/schema pattern
- Dynamic agent discovery from `metadata.yaml`
- Per-agent `main.py` that starts both backend and frontend
- Root `config.yaml` for port ranges and app settings
- `.env` with secrets only; ports come from `config.yaml` and `metadata.yaml`
- `CLAUDE.md` with coding rules
- Light professional theme for all UI
- All 12 wireframes implemented as React pages
- Agent-specific frontend pages inside each agent folder

### Not in scope (future specs)
- Authentication / user accounts
- Database (platform is file-based for now)
- Production deployment / reverse proxy
- npm workspaces (each agent frontend has its own package.json)
- AgentCore memory migration (EP-7)

---

## Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Agent folder naming | `demo1`, `demo2`, `demo3` | Decouples folder identity from use case |
| Shared code | `commons/logger.py` only | Memory is agent-specific; logger is truly shared |
| Agent memory | Inside each `agents/demoN/agentic/memory_backend.py` | Each agent owns its memory |
| Port ranges | Frontend 8001–8099 / Backend 3001–3099 | Clear separation, documented in `config.yaml` |
| Agent startup | Each `agents/demoN/main.py` starts both API + Vite | One command per agent, self-contained |
| Vite env | `main.py` writes `frontend/.env` before starting Vite | `VITE_API_URL` always matches `metadata.yaml` |
| Agent dependency management | Independent `package.json` per agent | Simplicity over monorepo complexity for now |
| Frontend nav between agents | Via port links from `metadata.yaml` | Acceptable for demo; production needs reverse proxy |
| Spec process | `specs/` folder, spec-first before code | Decisions are traceable; Claude sessions start from spec |

---

## Port Convention

| Layer | Port range | Examples |
|-------|-----------|---------|
| Platform frontend | 5000 | `localhost:5000` |
| Platform backend (`app/`) | 5001 | `localhost:5001` |
| Agent **frontends** | 8001 – 8099 | demo1→8001, demo2→8002, demo3→8003 |
| Agent **backends** | 3001 – 3099 | demo1→3001, demo2→3002, demo3→3003 |

---

## Target Folder Structure

```
ai-agents/
├── CLAUDE.md                    # Claude Code rules (auto-loaded every session)
├── config.yaml                  # Global port ranges + app settings
├── .env                         # Secrets only (gitignored)
├── .env.example                 # Documented secret template
├── requirements.txt
├── .gitignore
│
├── specs/                       # Living specs — source of truth for all decisions
│   ├── README.md
│   ├── _template.md
│   ├── v1-platform-restructure.md   ← this file
│   └── backlog/
│
├── commons/
│   ├── __init__.py
│   └── logger.py                # moved from utils/logger.py
│
├── app/                         # Central platform backend (:5001)
│   ├── __init__.py
│   ├── main.py                  # FastAPI, registers all routers
│   ├── config.py                # Typed settings from config.yaml + .env
│   ├── schemas/
│   │   ├── agent.py             # AgentSummary, AgentDetail
│   │   └── common.py            # HealthResponse, ConfigResponse
│   ├── routers/
│   │   ├── agents.py            # GET /api/agents, GET /api/agents/{id}
│   │   ├── health.py            # GET /api/health
│   │   └── config.py            # GET /api/config
│   ├── services/
│   │   └── agent_scanner.py     # Scans agents/*/metadata.yaml + live /ping probe
│   └── logs/
│
├── agents/
│   ├── __init__.py
│   ├── demo1/                   # Calvin — Claims Processing
│   │   ├── metadata.yaml
│   │   ├── main.py              # starts API :3001 + frontend :8001
│   │   ├── agentic/
│   │   │   ├── memory_backend.py
│   │   │   └── ... (agent.py, tools/, sub_agents/, etc.)
│   │   ├── apis/
│   │   ├── frontend/            # standalone Vite project
│   │   │   ├── package.json
│   │   │   ├── vite.config.ts   # @shared alias
│   │   │   └── src/pages/       # wireframes 06–12
│   │   ├── data/
│   │   │   ├── dummy/
│   │   │   ├── cases/
│   │   │   ├── emails/
│   │   │   ├── sessions/
│   │   │   └── memory/
│   │   ├── logs/
│   │   └── tests/
│   │
│   ├── demo2/                   # Arvo — Underwriting (stub)
│   ├── demo3/                   # Lance — Loan Processing (stub)
│   └── demox/                   # Template — never started, never modified
│       ├── GUIDELINES.md
│       ├── metadata.yaml        # status: template
│       ├── main.py
│       ├── agentic/
│       ├── apis/
│       ├── frontend/
│       ├── data/
│       └── tests/
│
├── frontend/                    # Shared marketplace UI (:5000) + shared components
│   └── src/pages/               # wireframes 01–05
│
├── wireframes/                  # Design source of truth (read-only reference)
└── scripts/
    ├── start.sh                 # reads config.yaml; scans agents/; calls each main.py
    ├── stop.sh
    ├── check.sh
    └── restart.sh
```

---

## config.yaml

```yaml
app:
  name: "Neural AI Agents"
  description: "AI agent marketplace platform"

ports:
  platform_frontend: 5000
  platform_backend:  5001
  agent_frontend:
    start: 8001
    end:   8099
  agent_backend:
    start: 3001
    end:   3099

defaults:
  memory_backend: local
  approval_timeout_seconds: 86400
  bedrock_model_id: "us.anthropic.claude-sonnet-4-20250514-v1:0"
  aws_region: us-east-1
```

---

## .env.example

```dotenv
# ─── AWS credentials ─────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# ─── Bedrock model (overrides config.yaml default) ───────────────────────────
BEDROCK_MODEL_ID=

# ─── Memory backend ──────────────────────────────────────────────────────────
# "local"     → JSON files in agents/demoN/data/memory/
# "agentcore" → Amazon Bedrock AgentCore Memory (requires EP-7)
MEMORY_BACKEND=local

# ─── Human-in-the-loop timeout (seconds) ─────────────────────────────────────
APPROVAL_TIMEOUT_SECONDS=86400

# ─── Python / Windows ────────────────────────────────────────────────────────
PYTHONUTF8=1
OTEL_SDK_DISABLED=true
```

---

## metadata.yaml Format (per agent)

```yaml
name: Calvin
description: >
  Multi-agent claims processing with human-in-the-loop approval,
  fraud detection, and medical review workflows.
use_case: claims_processing
domain: insurance
api_port: 3001
frontend_port: 8001
entry_point: "agents.demo1.apis.main:app"
api_version: "2.0.0"
status: active        # active | stub | template
version: "1.0.0"
```

---

## app/ API Endpoints (v1)

```
GET /api/agents           → list agents with live_status (folder scan + /ping probe)
GET /api/agents/{id}      → single agent detail
GET /api/config           → public port ranges and app name from config.yaml
GET /api/health           → {status, timestamp, agents_found}
```

Extension pattern: new feature = `routers/{domain}.py` + `services/{domain}_service.py` + register in `main.py`.

---

## Light Theme

```css
:root {
  --bg:#F8FAFC; --s:#FFFFFF;   --s2:#F1F5F9;  --s3:#E2E8F0;
  --b:#E2E8F0;  --b2:#CBD5E1;
  --t:#0F172A;  --t2:#475569;  --t3:#94A3B8;
  --ac:#2563EB; --acd:#DBEAFE;
  --gn:#059669; --gnd:#D1FAE5; --am:#D97706; --amd:#FEF3C7;
  --rd:#DC2626; --rdd:#FEE2E2; --tl:#0D9488; --tld:#CCFBF1;
  --pu:#7C3AED; --pud:#EDE9FE; --co:#EA580C; --cod:#FFEDD5;
}
```

---

## Wireframe → Page Mapping

| Wireframe | Component | Location |
|-----------|-----------|----------|
| 01_homepage | LandingPage.tsx | frontend/src/pages/ |
| 02_browse | BrowseAgentsPage.tsx | frontend/src/pages/ — calls GET /api/agents |
| 03_agent_detail | AgentDetailPage.tsx | frontend/src/pages/ |
| 04_connect | ConnectWorkspacePage.tsx | frontend/src/pages/ |
| 05_dashboard | DashboardPage.tsx | frontend/src/pages/ |
| 06_submit_claim | SubmitClaimPage.tsx | agents/demo1/frontend/src/pages/ |
| 07_claim_status | ClaimStatusPage.tsx | agents/demo1/frontend/src/pages/ |
| 08_queue | ReviewQueuePage.tsx | agents/demo1/frontend/src/pages/ |
| 09_review | ReviewClaimPage.tsx | agents/demo1/frontend/src/pages/ |
| 10_logs | AuditLogsPage.tsx | agents/demo1/frontend/src/pages/ |
| 11_rules | RulesEnginePage.tsx | agents/demo1/frontend/src/pages/ |
| 12_supervisor | SupervisorPage.tsx | agents/demo1/frontend/src/pages/ |

---

## Implementation Checklist

### Phase A — Restructuring
- [x] A0: Create CLAUDE.md, specs/, specs/README.md, specs/_template.md, commit this spec
- [x] A1: Create commons/__init__.py + commons/logger.py; move memory_backend.py to agents/demo1/agentic/
- [x] A2: Rename agents/claims→demo1, underwriting→demo2, loan→demo3; move test/→agents/*/tests/
- [x] A3: Create config.yaml at repo root
- [x] A4: Rewrite .env.example (secrets only)
- [x] A5: Create metadata.yaml + main.py for demo1, demo2, demo3
- [x] A6: Create app/ platform backend (main.py, config.py, schemas/, routers/, services/)
- [x] A6a: Port conflict validation in agent_scanner.py + start.sh
- [x] A6b: CORS — agent APIs allow origins from :5000 and their own frontend port
- [x] A7: Move agents/demo1/dummy_data/ → agents/demo1/data/dummy/
- [x] A8: Update utils.logger → commons.logger in 7 files in agents/demo1/
- [x] A9: Replace STORAGE_PATH env paths with agent-relative _CASES_DIR in 4 files
- [x] A10: Update dummy_data → data/dummy path references in 3 files
- [x] A11: Create agents/demox/ template folder with GUIDELINES.md + annotated starters
- [x] A12: Rewrite scripts/start.sh / stop.sh / check.sh — dynamic discovery from config.yaml
- [x] A13: Update .gitignore
- [x] A14: Delete utils/, storage/, root logs/, root test/

### Phase B — Frontend
- [x] B1: Apply light theme to frontend/src/index.css
- [x] B2: Set up agents/demo1/frontend/ as standalone Vite project with @shared alias
- [x] B3: Implement 5 shared marketplace pages (wireframes 01–05) in frontend/src/pages/
- [x] B4: Implement 7 demo1-specific pages (wireframes 06–12) in agents/demo1/frontend/src/pages/
- [x] B5: Wire routing in frontend/src/App.tsx and agents/demo1/frontend/src/App.tsx

---

## Verification

1. `./scripts/start.sh` — reads config.yaml, validates no port conflicts, starts platform (:5000/:5001) + all non-template agents
2. `GET localhost:5001/api/agents` → Calvin, Arvo, Lance with live_status
3. `GET localhost:5001/api/health` → `{status: ok, agents_found: 3}`
4. `localhost:5000` — light theme, BrowseAgentsPage shows live agent cards
5. `localhost:8001` — Calvin frontend, VITE_API_URL = :3001 (injected by main.py)
6. All 7 demo1 pages render matching wireframes
7. Submit test claim → case at agents/demo1/data/cases/{id}/; no CORS errors
8. Duplicate port in metadata.yaml → start.sh logs conflict warning
9. `pytest agents/demo1/tests/` passes
10. Root utils/, storage/, logs/, test/ no longer exist
