# Roadmap

Single index of every spec, grouped by lifecycle. Specs physically live in the
folder matching their status (`backlog/`, `active/`, `done/`). Detailed plans
live inside each spec; this file is the overview only. Process: see [README.md](README.md).

---

## Backlog — drafted, not yet scheduled

| Spec | Status |
|------|--------|
| [ep6-deployment.md](backlog/ep6-deployment.md) — EC2 deployment behind Nginx + systemd | draft |

---

## Active — approved / in progress

| Spec | Status |
|------|--------|
| [ui-professional-polish.md](active/ui-professional-polish.md) — copy, emoji, capitalization pass | in-progress |
| [demo0-agent5-trianz-voice-concierge.md](active/demo0-agent5-trianz-voice-concierge.md) — agent5: Nova Sonic voice/text Trianz front-door, SES OTP auth, sales + scheduling sub-agents | approved |

---

## Done — shipped, frozen decision records

| Spec | Status |
|------|--------|
| [v1-platform-restructure.md](done/v1-platform-restructure.md) — first platform restructure + UI overhaul | done |
| [v2-ai-lab-restructure.md](done/v2-ai-lab-restructure.md) — AI Lab + demos; demo0 = AI Agents Squad (current architecture) | done |
| [demo4-settlement-failure-prevention.md](done/demo4-settlement-failure-prevention.md) — Settlement agent (UC8) | done |
| [demo4-ui-v2-12-screens.md](done/demo4-ui-v2-12-screens.md) — Settlement agent 12-screen UI | done |
| [marketplace-nav-and-filters.md](done/marketplace-nav-and-filters.md) — marketplace nav + advanced filters | done |
| [runs-subsystem-and-template-versioning.md](done/runs-subsystem-and-template-versioning.md) — runs subsystem, HITL wiring, template versioning | done |
| [agentx-v2-template.md](done/agentx-v2-template.md) — Agent Template v2.0: must-have pages, ribbon, personas, self-test, API contract, config + restart | done |

---

## Iterations (historical framing)

- **Iteration 1 — Platform Restructure** *(done)* — repo restructure, spec-first process, light theme, platform backend. → `done/v1-platform-restructure.md`, `done/v2-ai-lab-restructure.md`
- **Iteration 2 — EC2 Deployment** *(backlog)* — deploy agents to EC2 behind Nginx with systemd. → `backlog/ep6-deployment.md`
