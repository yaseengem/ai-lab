# Spec: UI Professional Polish (copy, emoji, capitalization)
**Status:** done
**Version:** v1
**Date:** 2026-06-22

---

## Problem

The AI Lab UI is visually consistent (light theme, shared CSS) but the **copy is not enterprise-grade or consistent**. An audit across all four frontends (launcher `frontend/`, marketplace `demos/demo0/frontend/`, `agent1`, `agent4`) found:

1. **Casual / playful language** — "A lab of AI demos", harsh phrasing like "Rejected — fraud". (Note: "AI Agents Squad" is **retained** as the demo0 brand name — see Scope.)
2. **Decorative emoji** in logos, nav, buttons, headings, empty states (🤖 🚀 🎉 ⭐ 📭), heaviest in agent1.
3. **Technical/debug strings leaking to end users** — "via /api/health", "from agents/ folder", "Is the backend running?", "localhost:5001".
4. **Inconsistent capitalization** — mix of Title Case and sentence case across headings, nav, buttons, filters; lowercase words that should be capitalized; inconsistent acronym casing.

This undermines the impression the demo makes on an enterprise audience.

---

## Solution

A copy-only pass (no layout/color/routing changes) that enforces one formal voice:

- **Capitalization → sentence case** for all user-facing UI text. First word capitalized, the rest lowercase unless a proper noun or acronym.
- **Emoji → remove all decorative emoji**; keep only functional status/severity icons.
- **Debug language → removed** from every user-visible string.

### Capitalization rules

| Element | Rule | Example |
|---------|------|---------|
| Headings / section titles | Sentence case | "Operations command center" |
| Nav items / tabs | Sentence case | "Review queue", "Run logs" |
| Buttons / CTAs | Sentence case | "Submit claim", "Talk to sales" |
| Form / filter / stat labels | Sentence case | "Trigger mode", "SLA at risk" |
| Table column headers | Sentence case | "Run ID", "Critical" |
| Acronyms (anywhere) | Stay ALL-CAPS | API, SLA, HIPAA, SOC 2, FSCA, LOLR, JSE, ISIN, CPT, ICD-10, ID, ZAR |
| agent4 nav section dividers | Keep ALL-CAPS (intentional design) | OVERVIEW, MONITORING |
| Severity badge *values* | Keep ALL-CAPS | CRITICAL, HIGH, MEDIUM, LOW |

### Emoji whitelist (keep)

⚠️ 🚨 ⏰ ℹ️ and ✓/✗ — only where they mark status, severity, time-sensitivity, or validation (primarily agent4 alerts/escalations/countdowns).

**Kept as functional visual iconography (not "decorative emoji"):** the marketplace's domain/role/feature **icon-chips, card avatars, and the agent Overview feature glyphs** — e.g. the colored industry/agent/role chips in `LandingPage`, `BrowseAgentsPage`, `AgentDetailPage`, and `RoleSelectPage`. These sit inside colored chip elements as their only content; stripping them would leave empty boxes, which is a layout/color change this spec forbids. They are treated as part of the visual design, not loose copy.

**Stripped to text:** loose decorative emoji in logos, nav, buttons, headings, and empty states.

---

## Scope

### In scope

- Copy, capitalization, and emoji in the four frontends listed above.
- The launcher tagline data source (`config.yaml`, `frontend/public/demos.json`, `frontend/src/App.tsx` fallback).

### Not in scope

- Layout, color, component, or routing changes.
- `agentx_v*_*` templates and stub agents (agent2, agent3) with no frontend.
- Renaming status/severity enum *values* or filter option *keys* (`active`, `stub`, `queued`, …) — these are data, not display copy. If shown raw, map through a display formatter rather than renaming.
- **Renaming "AI Agents Squad"** — retained as the demo0 brand name per the user.
- **Re-casing agent4** — agent4 already reads professionally; per the user, established Title Case labels (e.g. "Human Approval Required", "Operations Command Center") are left as-is. agent4 emoji are functional console/event glyphs and are kept.

---

## Architecture impact

None. Copy-only changes to existing `.tsx` files plus the launcher manifest data (`config.yaml` / `demos.json`). No new files, ports, or dependencies.

---

## Implementation Checklist

- [x] A. Casual language — launcher tagline (config.yaml + demos.json + App.tsx fallback); "Rejected — fraud" → "Rejected: fraud indicator". ("AI Agents Squad" retained as the demo0 brand name — see Scope.)
- [x] B. Remove loose decorative emoji — marketplace (LandingPage, DashboardPage, NotFoundPage, ConnectWorkspacePage) + agent1 (logo, nav, buttons). Domain/role/feature chip icons retained as visual iconography (see Emoji whitelist).
- [x] C. Debug strings → user-facing copy — DashboardPage, UserChatPage, SupportChatPage, BrowseAgentsPage.
- [x] D. Sentence-case capitalization — agent1 nav reconciliation, marketplace "Clear", agent4 nav/headings/filters + stray "CRITICAL" column header.

---

## Verification

1. Grep sweep: no loose decorative emoji in logos/nav/buttons/headings/empty-states (domain/role/feature chip iconography retained by design); debug strings (`api/health` in copy, `agents/ folder`, `backend running`, `localhost:5001`) return zero user-facing hits. Functional `href` links to local agent ports and the dashboard "Ports info" grid are not debug copy.
2. `npm run build` succeeds in each changed frontend.
3. Run the app (`run.sh`) and walk launcher → marketplace → agent1 → agent4: sentence case, no decorative emoji, no debug strings, functional alert icons still present, light theme intact.
