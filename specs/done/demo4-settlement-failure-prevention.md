# Spec: demo4 — Settlement Failure Prediction & Prevention Agent (UC8)

**Status:** done
**Version:** v1
**Date:** 2026-05-06

---

## Problem

JSE operates a T+3 settlement cycle creating a 3-day window where counterparty insolvency, securities lending mismatches, and liquidity failures can trigger cascading settlement failures. ECS, CIS, and TIS expose pre-settlement data but no automated intelligence layer synthesises these signals proactively. Manual intervention is too slow and JSE's LOLR facility requires human execution.

---

## Solution

7-step multi-agent pipeline on AWS Strands (Agents-as-Tools pattern) monitoring T+1/T+2 exposure, classifying risk via deterministic rules + LLM reasoning, executing interventions (LOLR, settlement rolls, alerts), and producing FSCA-compliant audit reports. Triggered via API or frontend file upload. All ECS/CIS/TIS APIs are mocked with Section 6.2 test data.

---

## Scope

### In scope
- `agents/demo4/` — Nexus agent, api_port: 3004, frontend_port: 8004
- Master Orchestrator + 7 Strands sub-agents (Agents-as-Tools)
- Mock tools for all ECS/CIS/TIS/Strate/JSE APIs
- Two trigger modes: API trigger (mock data) and file upload (CSV/JSON)
- Human-in-the-loop approval gate for LOLR items
- SSE streaming of pipeline step progress
- Frontend: Run & Monitor page + Summary Dashboard page

### Not in scope
- Real AWS deployment (Lambda, EventBridge, etc.)
- Real API integrations
- AgentCore memory backend
- Tests — future spec (all 20 test cases from UC8 Section 6 are ready to implement)

---

## Architecture impact

- New: `agents/demo4/` — full agent per repo conventions
- Ports: api_port: 3004, frontend_port: 8004
- No changes to app/, commons/, other agents

---

## Implementation Checklist

- [x] Save spec to specs/demo4-settlement-failure-prevention.md
- [ ] Scaffold agents/demo4/ (metadata.yaml, main.py)
- [ ] agentic/tools/mock_data.py — Section 6.2 test data
- [ ] agentic/tools/ — ecs, cis, tis, jse, strate, audit mock tools
- [ ] agentic/prompts.py — all 8 system prompts
- [ ] agentic/sub_agents/ — 7 sub-agents
- [ ] agentic/agent.py — master orchestrator
- [ ] apis/ — schemas, service, agent_bridge, routes, main
- [ ] frontend/ — Vite React, MonitorPage, DashboardPage

---

## Verification

1. `python agents/demo4/main.py` — backend on :3004, frontend on :8004
2. `GET /ping` → `{"status": "ok"}`
3. Platform: demo4 appears in `GET /api/agents`
4. API trigger run: all 7 steps complete, 3 CRITICAL / 1 HIGH / 1 MEDIUM / 3 LOW
5. File upload run: CSV parsed, same risk distribution
6. Human approval gate: TRD-2005 pauses, resumes on /approve
7. Summary Dashboard populates after multiple runs

---

## Future: Tests (placeholder)

TC-01 to TC-20 from UC8 Section 6 are fully specified and ready for a follow-up spec.
