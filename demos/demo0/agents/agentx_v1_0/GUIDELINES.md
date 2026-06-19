# New Agent Guidelines (Template v1.0)

This is the v1.0 template. Future template versions live alongside as
`agents/demox_v2_0/`, `agents/demox_v3_0/`, etc. Pick the latest version
when starting a new agent.

## Starting a new agent

1. Copy this folder: `cp -r agents/demox_v1_0 agents/demoN`
2. Update `metadata.yaml`:
   - set `name`, `description`, `use_case`, `domain`, `api_port`, `frontend_port`
   - change `status: template` → `status: stub` (or `active`)
   - update `entry_point` to `agents.demoN.apis.main:app` (use the new folder name)
   - keep `template_version: "1.0"` so we can track which template version this agent inherits from
3. Update Python module strings inside the new folder: any `agents.demox_v1_0.*` → `agents.demoN.*`
4. Write a spec in `specs/` first (see `specs/_template.md`)
5. Implement agentic logic inside `agentic/`
6. Wire up the FastAPI app inside `apis/`
7. Add your frontend inside `frontend/` (standalone Vite project)

## Folder map

```
agents/demoN/
├── metadata.yaml          # agent identity — read by platform scanner and main.py
├── main.py                # starts API + frontend (copy from demox_v1_0, unchanged)
├── GUIDELINES.md          # (remove from your copy once read)
│
├── agentic/               # all AI/agent code lives here
│   ├── __init__.py
│   ├── agent.py           # top-level agent: build the Strands Agent, expose run_chat()
│   ├── model.py           # Bedrock model client
│   ├── prompts.py         # system prompt strings
│   ├── memory_backend.py  # LocalMemoryStore — agent-relative path, do not move
│   ├── tools/             # @tool-decorated functions
│   │   └── __init__.py
│   └── sub_agents/        # Strands sub-agents (agents-as-tools pattern)
│       └── __init__.py
│
├── apis/                  # FastAPI application
│   ├── __init__.py
│   ├── main.py            # FastAPI app, CORS (allow :5000 + own frontend_port)
│   ├── routes.py          # router with /ping, /sessions, /chat/{id}, etc.
│   ├── schemas.py         # Pydantic request/response models
│   └── service.py         # service layer between routes and agentic/
│
├── frontend/              # standalone Vite + React project
│   ├── package.json       # own dependencies — no npm workspaces
│   ├── vite.config.ts     # @shared alias → ../../frontend/src
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── pages/         # one file per wireframe page
│
├── data/
│   ├── dummy/             # seed/demo data (read-only at runtime)
│   ├── cases/             # per-case folders created at runtime
│   ├── sessions/          # session metadata JSON files
│   └── memory/            # LocalMemoryStore JSON files
│
├── logs/                  # agent log files (gitignored)
└── tests/                 # pytest test files
    └── __init__.py
```

## Key rules (from CLAUDE.md)

- **Never modify demox_v1_0** (or any demox_vN_M) — they are templates. Copy them.
- `metadata.yaml status: template` → the platform scanner skips this agent.
- `main.py` is shared logic — do not customise it per agent.
- Memory backend is at `agentic/memory_backend.py` and stores to `data/memory/`.
- All data paths are relative to the agent folder — no STORAGE_PATH env var.
- CORS in `apis/main.py` must allow `:5000` (platform) and `frontend_port`.
- Frontend `.env` is written by `main.py` at startup — never hardcode VITE_API_URL.
