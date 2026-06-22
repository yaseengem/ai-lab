# Tech Stack

**Living reference — kept current.** Decision history (why we chose things) lives in `specs/done/`.

> For ports and run/build/test commands, see `CLAUDE.md`. For system design, see [architecture.md](architecture.md).

---

## Backend (Python)

- **Python 3.12**
- **FastAPI** `0.116.1` — all HTTP APIs (platform scanner + each agent)
- **Uvicorn[standard]** `0.35.0` — ASGI server (single worker; HITL approval state is in-process memory)
- **Pydantic v2** — schemas / validation
- **python-multipart** `0.0.9` — file uploads
- **pypdf** `>=4.0.0`, **Pillow** `>=10.0.0` — document/image handling
- **filelock** `>=3.12.0` — local file-backed state
- **python-dotenv** `>=1.0.0` — `.env` loading

Dependencies are declared in the root [`requirements.txt`](../requirements.txt).

## AI / LLM

- **AWS Bedrock** accessed via the **Strands Agents SDK** (`strands-agents`, `strands.models.BedrockModel`) — agents are **not** wired to a direct Anthropic or OpenAI SDK.
- **boto3** `>=1.40.1` / `botocore` — AWS client + retry config.
- Default model: `us.anthropic.claude-sonnet-4-20250514-v1:0` (override with `BEDROCK_MODEL_ID`).
- Region: `us-east-1` (override with `AWS_REGION`). Credentials + overrides come from `demos/demo0/.env` (see `.env.example`).

## Frontends (Node)

- **Node 18+**, **npm** as package manager.
- **React 18**, **Vite 5**, **TypeScript 5** across the launcher, the marketplace, and each agent frontend.
- Marketplace ([`demos/demo0/frontend`](../demos/demo0/frontend)) adds **Tailwind CSS 3**, **react-router-dom 6**, **react-markdown 9**.
- Standard scripts in every `package.json`: `dev` (vite), `build` (`tsc && vite build`), `preview`.

---

## Dependency rule

**Don't add a dependency without an approved spec.** Pin backend versions in `requirements.txt`; prefer reusing what's already here over adding a new library. New AI providers / SDKs are an architecture change — spec it first.
