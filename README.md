# AI Lab

**AI Lab** is a demo platform that hosts multiple independent **demos**. The top-level landing page lists every demo and links into it.

| Demo | What it is | Status |
|------|------------|--------|
| **demo0 — AI Agents Squad** | A multi-agent platform: a marketplace UI + a scanner backend + AI agents (Claims, Underwriting, Loan, Settlement) with role-aware chat and human-in-the-loop approval. | Active |
| **demo1 — Human in the Loop** | — | Under development |
| **demo2 — Fleet Management** | — | Under development |

See [specs/done/v2-ai-lab-restructure.md](specs/done/v2-ai-lab-restructure.md) for the architecture and [docs/architecture.md](docs/architecture.md) for deeper technical design.

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| AWS credentials | Bedrock access (Claude model) — for active agents |

---

## Local setup

```bash
# 1. Python deps (single shared venv at repo root)
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 2. Secrets for the agent squad
cp demos/demo0/.env.example demos/demo0/.env
# Fill in AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use an instance profile)

# 3. Start everything
./scripts/run.sh
```

`run.sh` starts the AI Lab launcher and the AI Agents Squad (its backend, marketplace, and all active agents), validating port conflicts first.

| Service | URL |
|---|---|
| AI Lab landing page | http://localhost:5000 |
| AI Agents Squad — marketplace | http://localhost:8001 |
| AI Agents Squad — backend API | http://localhost:8002/api/health |
| agent1 (Claims) frontend / API | http://localhost:8010 / :8011 |
| agent4 (Settlement) frontend / API | http://localhost:8040 / :8041 |

> **Important:** agents run with a single uvicorn worker. The human-in-the-loop approval flow stores state in process memory — multiple workers would each have isolated registries and `POST /approve` could miss the waiting workflow.

---

## Project structure

```
ai-lab/
├── config.yaml              # AI Lab launcher port + demos manifest
├── requirements.txt
├── frontend/                # AI Lab landing page (:5000)
├── scripts/                 # run.sh / stop.sh / check.sh / restart.sh
├── specs/                   # living specs (source of truth)
├── wireframes/              # design source of truth
└── demos/
    └── demo0/               # "AI Agents Squad" — self-contained
        ├── config.yaml      # squad ports + defaults
        ├── .env(.example)   # squad secrets
        ├── app/             # scanner backend (:8002)
        ├── commons/         # logger
        ├── frontend/        # marketplace UI (:8001)
        └── agents/
            ├── agent1/       # Claims (active)      — :8010 / :8011
            ├── agent2/       # Underwriting (stub)  — :8020 / :8021
            ├── agent3/       # Loan (stub)          — :8030 / :8031
            ├── agent4/       # Settlement (active)  — :8040 / :8041
            └── agentx_v1_0/  # template (never run)
```

---

## Running tests

```bash
cd demos/demo0
pytest app/tests/              # platform scanner tests
pytest agents/agent1/tests/    # Claims API tests
```
