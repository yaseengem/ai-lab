# Spec: demo0 / agent5 — Trianz Voice Concierge (Nova Sonic front-door)

**Status:** approved
**Version:** v1
**Date:** 2026-06-30

---

## Problem

Trianz (a consulting / system-integration company) has no conversational front door. A prospect
who lands wanting to understand Trianz's offerings, Concierto platform suite, and SI work has to
read pages or fill a form. We want an **agentic front door**: a visitor talks to it — **by voice
and text** — and it explains the offerings, qualifies interest, and books a human conversation when
wanted. Because the goal is qualified business leads (not the public), access must be gated to
**verified business emails**.

This is intentionally a showcase of **Amazon Nova Sonic** (real-time speech-to-speech) inside the
AI Lab, and it stretches the v2.0 template in three ways the design must reconcile (voice backend,
real authentication, external-facing sub-agents).

---

## Solution

A new **agent5** under `demos/demo0`, scaffolded from the latest template (`agentx_v2_0`), with:

- **Nova Sonic as a cross-modal supervisor.** Voice flows over a **WebSocket** to a server-side
  bidirectional Bedrock stream (`invoke_model_with_bidirectional_stream`). Sonic uses **function
  calling** to invoke tools/sub-agents. Per the AWS reference architecture
  (`building-a-multi-agent-voice-assistant-with-amazon-nova-sonic-and-amazon-bedrock-agentcore`),
  sub-agents are exposed to Sonic **as tools**; they are **Strands agents run in-process** (the
  sample uses AgentCore — omitted here, matching this repo's "AgentCore = future" stance). Text
  flows over the existing canonical SSE `/chat`, routed through a Strands **Nova text** agent that
  shares the **same tool layer**, so behaviour matches across modalities.
- **Real AWS SES email-OTP authentication** as a gate in front of the agent: a business-email
  **allowlist** (wildcards, e.g. `*.trianz.com`), a **public-domain blocklist** (gmail/yahoo/…), and
  a 6-digit OTP delivered by **real SES**. (The template's personas remain a *view*; this is a
  separate, real access gate — a deliberate, documented departure.)
- **Two external-facing sub-agents:** a **sales** sub-agent (recommend offering, capture interest)
  and a **scheduling** sub-agent that, when the visitor wants to talk to a human, sends a **real SES
  email with a `.ics` calendar invite** (no CRM, no OAuth calendar).
- **Knowledge from a git-tracked `content/` folder** (Trianz pages dropped in by the operator),
  ingested at startup and exposed via a `search_trianz_knowledge` tool.

All other v2.0 standards are kept: standard Ribbon + must-have pages, canonical API contract,
`awaiting_setup`, durable HITL, per-agent `state/`, scenario self-test, no pricing.

---

## Scope

### In scope
- `demos/demo0/agents/agent5/` — full agent from `agentx_v2_0`; `api_port: 8051`, `frontend_port: 8050`.
- Nova Sonic voice loop: `agentic/sonic_session.py` (asyncio bidirectional stream) + `WS /voice/{session_id}`.
- Cross-modal text path via SSE `/chat` through a Strands **Nova text** agent sharing the tool layer.
- Real SES OTP auth: `agentic/tools/auth.py` (wildcard allowlist via `fnmatch`, public-domain block,
  OTP issue/verify, durable challenges/sessions under `state/auth/`) + `POST /auth/request`,
  `POST /auth/verify`, `GET /auth/status`. Voice WS, `/chat`, `/run` require a verified session.
- `agentic/tools/email_ses.py` — real `boto3` SESv2 send (OTP plain email; meeting email as raw MIME
  with a hand-rolled `.ics` attachment).
- Sub-agents (flat modules): `agentic/sales_agent.py` (`recommend_offering`, `capture_lead`),
  `agentic/scheduling_agent.py` (`request_human_meeting` → `.ics` + SES). Registered both as Sonic
  toolSpecs and Strands tools.
- Knowledge: `content/` folder + `agentic/knowledge.py` (keyword/BM25 retrieval into `state/index/`).
- `agent.config.yaml`: personas (**visitor / sales / admin**); `defaults` (`model_id`,
  `sonic_model_id`, `ses_sender`, `aws_region`, `allowlist_domains`, `blocked_public_domains`,
  `otp_ttl_seconds`); `integrations` (AWS SES, Nova Sonic — IAM-based mock Connect, **no OAuth**);
  updated `capabilities`.
- Frontend: new **Auth gate** page (email → OTP) before persona select; **Voice UI** in Chat
  (AudioWorklet mic 16 kHz PCM → WS, 24 kHz PCM playback, live transcript, mic/text toggle); other
  must-have pages + Ribbon kept.
- `seeds/test_scenarios/*.json` + `/test/*` + Test Runner; `architecture.md` (≤1000 words + Mermaid);
  `create_dummy_data.py`.
- `docs/ports.md`: add agent5 row, advance next-free to 8060/8061.

### Not in scope
- CRM integration; OAuth calendar/booking (scheduling = SES email + `.ics` only).
- Real AWS deployment (EC2/Lambda); AgentCore hosting of sub-agents (in-process only).
- Embedding-based RAG (keyword retrieval first; Titan embeddings is a later option).
- Auth as a full security product (no password store, no RBAC beyond persona views).

---

## Architecture impact

- **New folder** `demos/demo0/agents/agent5/` incl. a new git-tracked **`content/`** folder and new
  `state/auth/` runtime subtree (paths via `agentic/paths.py`).
- **Additive APIs** (canonical contract preserved): `WS /voice/{session_id}`, `POST /auth/request`,
  `POST /auth/verify`, `GET /auth/status`.
- **Ports:** 8050 / 8051; `docs/ports.md` updated in the same change.
- **Dependencies (repo dependency rule):** prefer `boto3`-only. If the pinned `boto3` lacks
  `invoke_model_with_bidirectional_stream`, add AWS's experimental **`aws-sdk-bedrock-runtime`** and
  pin it in root `requirements.txt`. `.ics` hand-rolled (no dep); WebSocket via FastAPI/`uvicorn[standard]`
  (already present); SES via `boto3` (already present).
- **Departure from template philosophy (documented):** real authentication in front of an agent
  whose personas are otherwise a view. Auth is agent-owned (no shared module); other agents unaffected.
- No changes to `app/`, `commons/`, `main.py` (shared launcher), or other agents.

---

## Implementation Checklist

- [x] Save this spec to `specs/active/`
- [ ] Scaffold `agents/agent5/` from `agentx_v2_0` (copy, rename imports, metadata.yaml, remove GUIDELINES)
- [ ] `docs/ports.md` — add agent5 row, advance next-free to 8060/8061
- [ ] `content/` folder + `agentic/knowledge.py` (`search_trianz_knowledge`) + Trianz prompt summary
- [ ] `agentic/tools/auth.py` + `agentic/tools/email_ses.py` + auth endpoints + session enforcement
- [ ] `agentic/sales_agent.py` + `agentic/scheduling_agent.py` (lead capture; SES + `.ics`)
- [ ] `agentic/sonic_session.py` + `agentic/model.py` (sonic_model_id, get_text_model) + `WS /voice`
- [ ] Wire text `/chat` through the shared tool layer (Nova text agent)
- [ ] `agent.config.yaml` (personas, defaults, integrations, capabilities) + `awaiting_setup` checks
- [ ] Frontend: Auth gate page + Voice UI in Chat; keep standard pages/Ribbon
- [ ] `seeds/test_scenarios/*.json` + Test Runner wiring; `architecture.md`; `create_dummy_data.py`
- [ ] End-to-end verification (below)

---

## Verification

Run from `demos/demo0`:

1. Start agent5; `GET /ping` → `awaiting_setup`. Configure SES sender + allowlist via Config →
   `POST /admin/setup` → `POST /admin/restart` → `/ping` = `ok`. agent5 appears in `GET /api/agents`.
2. **Auth:** a business email → real OTP email via SES → `/auth/verify` unlocks the session; a
   public/gmail email is rejected by the allowlist **before** any send.
3. **Voice:** speak a question about Trianz → spoken + transcribed reply sourced from `content/`.
4. **Text (cross-modal):** same question via the text box → same tool-backed answer.
5. **Sales:** express interest → lead recorded under `state/data/leads/`.
6. **Scheduling:** "I'd like to talk to someone" → real SES email with a `.ics` invite arrives;
   meeting recorded under `state/data/meetings/`.
7. **Self-test:** Test Runner runs the scenarios; all pass vs `expected`. Clean `scripts/run.sh`
   start (no port conflict).
