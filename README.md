# Neural — Multi-Agent AI Platform for Financial Services

Neural is a demo multi-agent AI platform that exposes three isolated AI agents — **Claims Processing**, **Underwriting**, and **Loan Processing** —each with role-aware chat interfaces (User, Support, Admin) and a full human-in-the-loop approval workflow.

See [docs/architecture.md](docs/architecture.md) for the full technical design.

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| AWS credentials | Bedrock access required (Claude model) |

---

## Local Setup

### 1. Clone and copy environment config

```bash
cp .env.example .env
# Fill in AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or use instance profile)
```

### 2. Install backend dependencies

Each agent has its own `requirements.txt`. For local dev, install claims first:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r agents/claims/apis/requirements.txt
```

### 3. Install frontend dependencies

```bash
cd frontend
cp .env.example .env
npm install
```

### 4. Run the services

**Terminal 1 — Claims API:**
```bash
source .venv/bin/activate
cd agents/claims/apis
uvicorn main:app --port 8001
```

> **Important:** Always run with a single worker (no `--workers` flag). The human-in-the-loop approval flow uses `asyncio.Event` objects stored in process memory — multiple workers would each have isolated registries and `POST /approve` could miss the waiting workflow.

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Frontend runs at http://localhost:5173 with mock APIs by default (`VITE_USE_MOCK_API=true`).  
Set `VITE_USE_MOCK_API=false` and ensure the backend is running to use real APIs.

---

## Project Structure

```
ai-agents/
├── agents/
│   ├── claims/
│   │   ├── apis/          # FastAPI app — runs on :8001
│   │   └── agentic/       # Strands workflow + tools
│   ├── underwriting/      # Same structure — runs on :8002
│   └── loan/              # Same structure — runs on :8003
├── frontend/              # React + Vite + TypeScript
├── storage/               # Runtime file system (gitignored)
│   ├── claims/{case_id}/
│   ├── underwriting/{case_id}/
│   ├── loan/{case_id}/
│   └── memory/            # LocalMemoryStore JSON files
├── test/                  # pytest test suites
├── docs/                  # Architecture and design docs
└── iterations/            # Sprint planning and user stories
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `AWS_REGION` | AWS region for Bedrock | `us-east-1` |
| `BEDROCK_MODEL_ID` | Bedrock model ID | `anthropic.claude-3-haiku-20240307-v1:0` |
| `STORAGE_PATH` | Root path for file system storage | `./storage` |
| `MEMORY_BACKEND` | Memory backend: `local` or `agentcore` | `local` |
| `CLAIMS_API_PORT` | Claims FastAPI port | `8001` |
| `UNDERWRITING_API_PORT` | Underwriting FastAPI port | `8002` |
| `LOAN_API_PORT` | Loan FastAPI port | `8003` |

---

## Running Tests

```bash
# Memory backend unit tests
pytest test/test_memory_backend.py -v

# Claims API integration tests (requires running claims API on :8001)
pytest test/claims/test_claims_api.py -v
```
