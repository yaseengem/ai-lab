# Spec: demo4 — UI Expansion (12 Screens)

**Status:** done
**Version:** v2
**Date:** 2026-05-06

---

## Context

The demo4 frontend currently has 2 pages: `MonitorPage` (pipeline runner + SSE stream) and `DashboardPage` (aggregate stats). The use case (UC8) calls for a full JSE operations platform with 12 distinct screens covering monitoring, interventions, approvals, counterparty risk, compliance, and admin. This spec covers the frontend expansion only — no backend changes.

---

## Problem

The current 2-page UI surfaces only a fraction of the data the pipeline already produces via SSE events. Rich outputs from Steps 3–7 (counterparty briefs, intervention plans, LOLR transactions, settlement rolls, audit reports) are discarded or shown only as raw JSON. Operations staff have no structured views for approvals, watchlist filtering, counterparty drilling, or FSCA compliance review.

---

## Solution

Add 10 new page components, refactor 2 existing ones, introduce a shared `RunContext` to propagate SSE data across all screens, and replace the current top-nav with a left sidebar. No backend changes — all new screens consume data already emitted by the SSE stream or the existing `/summary` endpoint.

---

## Scope

### In scope
- 12 screens (details below)
- Left sidebar navigation replacing current top horizontal links
- `RunContext` — React Context capturing all SSE events from MonitorPage, making structured data available to every screen
- Shared `src/types.ts` for all TypeScript interfaces
- AWS Bedrock for the model only — all serving is local (`:3004` backend, `:8004` frontend)

### Not in scope
- New backend API endpoints (no backend changes in this plan)
- Real AWS infrastructure (EventBridge, Lambda, CloudTrail, SNS, S3)
- Rule Config persistence (local state only for now)
- Alerts persistence (derived from SSE events, local state)

---

## Architecture Impact

### New files
```
agents/demo4/frontend/src/
├── types.ts                          (shared interfaces — extracted from both pages)
├── context/
│   └── RunContext.tsx                (shared pipeline run state)
└── pages/
    ├── CommandCenterPage.tsx         (Screen 1 — replaces DashboardPage.tsx)
    ├── WatchlistPage.tsx             (Screen 2)
    ├── TradeDetailPage.tsx           (Screen 3)
    ├── InterventionPlanPage.tsx      (Screen 4)
    ├── LolrExecutionPage.tsx         (Screen 5)
    ├── SettlementRollPage.tsx        (Screen 6)
    ├── EscalationsPage.tsx           (Screen 7)
    ├── CounterpartyProfilesPage.tsx  (Screen 8)
    ├── AuditReportPage.tsx           (Screen 10)
    ├── RuleConfigPage.tsx            (Screen 11)
    └── AlertsPage.tsx                (Screen 12)
```

### Modified files
```
agents/demo4/frontend/src/
├── App.tsx           (sidebar layout, 12 routes, RunContextProvider)
└── pages/
    ├── MonitorPage.tsx     (Screen 9 — enhanced, writes to RunContext)
    └── DashboardPage.tsx   (deleted — replaced by CommandCenterPage)
```

### Routes
```
/                          → CommandCenterPage     (Screen 1)
/watchlist                 → WatchlistPage         (Screen 2)
/watchlist/:tradeId        → TradeDetailPage       (Screen 3)
/intervention-plan         → InterventionPlanPage  (Screen 4)
/lolr-execution            → LolrExecutionPage     (Screen 5)
/settlement-rolls          → SettlementRollPage    (Screen 6)
/escalations               → EscalationsPage       (Screen 7)
/counterparties            → CounterpartyProfilesPage (Screen 8)
/monitor                   → MonitorPage           (Screen 9)
/audit-report              → AuditReportPage       (Screen 10)
/rules                     → RuleConfigPage        (Screen 11)
/alerts                    → AlertsPage            (Screen 12)
```

### Navigation (left sidebar, 220px)
```
OVERVIEW
  Dashboard

MONITORING
  Settlement Watchlist
  Counterparty Profiles

INTERVENTIONS
  Intervention Plan
  LOLR Execution
  Settlement Rolls

APPROVALS
  Human Escalations         ← badge shows pending count

PIPELINE
  Pipeline Monitor

COMPLIANCE
  FSCA Audit Report
  Alerts & Notifications

ADMIN
  Rule Configuration
```

---

## RunContext Design

`RunContext` holds all structured data extracted from SSE events. `MonitorPage` is the only writer; all other screens are readers.

```typescript
interface RunContextState {
  sessionId: string | null
  runId: string | null
  running: boolean
  done: boolean
  steps: StepState[]
  riskItems: RiskItem[]
  counterpartyBriefs: CounterpartyBrief[]   // from 'counterparty-brief' events
  interventionItems: InterventionItem[]      // from 'intervention-item' events
  lolrItems: LolrItem[]                     // from 'lolr-execution' events
  lolrTotalZar: number
  rollItems: RollItem[]                     // from 'roll-execution' events
  pendingApprovals: ApprovalItem[]
  approvalHistory: ApprovalDecision[]
  systemicRisk: boolean
  dataQualityFlags: string[]
  doneSummary: Record<string, unknown> | null
  eventLog: SseEvent[]

  // Actions (called by MonitorPage)
  handleEvent: (ev: SseEvent) => void
  reset: () => void

  // Actions (called by EscalationsPage + LolrExecutionPage)
  approve: (itemId: string) => void
  reject: (itemId: string) => void
}
```

SSE events mapped to context fields:
| Event type | Context field updated |
|---|---|
| `pipeline-step` | `steps` |
| `risk-item` | `riskItems` |
| `counterparty-brief` | `counterpartyBriefs` |
| `intervention-item` | `interventionItems` |
| `lolr-execution` | `lolrItems`, `lolrTotalZar` |
| `roll-execution` | `rollItems` |
| `human-approval-required` | `pendingApprovals` |
| `approval-decision` | `pendingApprovals` (remove), `approvalHistory` (add) |
| `systemic-risk-alert` | `systemicRisk = true` |
| `data-quality-flag` | `dataQualityFlags` |
| `done` | `done = true`, `doneSummary` |

For screens that need lolr/roll data but the backend doesn't emit `lolr-execution`/`roll-execution` events yet, derive them from `intervention-item` events with `intervention_type === 'LOLR_TRIGGER'` / `'SETTLEMENT_ROLL'`.

---

## Screen Specifications

### Screen 1 — Operations Command Center (`CommandCenterPage`)
**Data:** `/summary` API + `RunContext` live fields

Sections:
- **Live run status bar** — last run timestamp, steps complete, running indicator
- **Risk summary tiles** (4 tiles) — CRITICAL / HIGH / MEDIUM / LOW counts from latest run
- **Active interventions** — counts of LOLR executing, rolls submitted (from RunContext)
- **Systemic stress banner** — full-width red banner when `systemicRisk === true`
- **Pending approvals widget** — count + "Go to Escalations" link
- **System health row** — ECS / CIS / TIS status chips (from `dataQualityFlags` — CIS_UNAVAILABLE → red, else green)
- **Recent runs table** — same as current DashboardPage table
- **Value protected metric** — ZAR total from `/summary`

### Screen 2 — Settlement Watchlist (`WatchlistPage`)
**Data:** `RunContext.riskItems` + `RunContext.interventionItems` (joined on trade_id)

Layout: filter bar + sortable table

Columns: Trade ID | Counterparty | Instrument (ISIN) | Settlement Window | Value (ZAR) | Risk Classification | Rule Triggers | Recommended Intervention

Filter bar: risk tier (multi-select chips) · settlement window (T+1 / T+2 toggle) · counterparty search · intervention type

Row click → navigate to `/watchlist/:tradeId`

Empty state: "Start a pipeline run on Pipeline Monitor to populate the watchlist."

### Screen 3 — Trade / Counterparty Detail (`TradeDetailPage`)
**Data:** `RunContext.riskItems`, `RunContext.counterpartyBriefs`, `RunContext.interventionItems` — all joined on `trade_id` from URL param

Layout: back button → two-column card layout

Left column:
- Trade facts card: ISIN, instrument, quantity, value, settlement date, T+1/T+2 label
- Risk classification card: tier badge + full `classification_rationale` text + rule trigger tags

Right column:
- Counterparty profile card: CIS status chip, net obligation, lending balance %, last failure date, watchlist status
- Counterparty risk brief card: root cause category badge, 3–5 sentence severity assessment, securities at risk list (ISIN + shortfall qty), intervention urgency
- Intervention card: type badge, 2-sentence rationale, estimated cost ZAR, execution priority, human approval required flag

### Screen 4 — Intervention Plan (`InterventionPlanPage`)
**Data:** `RunContext.interventionItems`

Layout: plan summary stats row + grouped sections

Summary row (4 stat chips): total LOLR | total Rolls | total Alerts | total Escalations + total estimated cost ZAR

Grouped sections (one per intervention type):
- LOLR_TRIGGER (red header)
- SETTLEMENT_ROLL (amber header)
- ALERT_OPERATIONS (blue header)
- HUMAN_ESCALATION (purple header)

Per item row: trade ID | counterparty | rationale | estimated cost | priority | approval badge

Action buttons: "Approve All LOLR" (calls RunContext.approve for each) · "Go to Escalations"

Empty state when no run has completed.

### Screen 5 — LOLR Execution (`LolrExecutionPage`)
**Data:** `RunContext.lolrItems`, `RunContext.lolrTotalZar`, `RunContext.pendingApprovals`

Sections:
- **ZAR 500M guard progress bar** — `lolrTotalZar / 500_000_000 * 100%`, color shifts amber >80%, red >95%
- **Execution log table**: transaction ID | counterparty | ISIN | direction (LEND/BORROW) | value ZAR | status badge | confirmation ID | timestamp
  - Status badges: Pending (gray) · Confirmed (green) · Failed (red) · Awaiting Approval (amber)
- **Pending approvals section** (if any): per item card with approve/reject buttons (calls RunContext.approve/reject → POST `/approve/{sid}/{itemId}`)
- **Failed transactions** with retry count and escalation link

### Screen 6 — Settlement Rolls (`SettlementRollPage`)
**Data:** `RunContext.rollItems`

Sections:
- **Roll log table**: Trade ID | Original settlement date | New settlement date | Reason code | Strate confirmation ref | Counterparty notified | Status
- **Ineligible trades** (escalated): separate section with trade IDs and reason
- Status chips: Submitted · Confirmed · Failed · Ineligible
- Retry indicator on failed rows

### Screen 7 — Human Escalations & Approvals (`EscalationsPage`)
**Data:** `RunContext.pendingApprovals`, `RunContext.approvalHistory`, `RunContext.interventionItems` (for HUMAN_ESCALATION items)

Sections:
- **Pending approvals queue** (red border if any):
  - Per item: LOLR transaction card with full context (trade, ISIN, value, rationale, risk brief)
  - 20-min timeout countdown (calculated from event timestamp)
  - Approve / Reject / Override buttons — calls RunContext.approve/reject
  - Mandatory comment field (stored in local state, shown in history)
- **Escalated items** (HUMAN_ESCALATION intervention type, REGULATORY_FLAG, systemic risk):
  - Per item: risk brief + agent rationale + assigned agent step
- **Approval history table**: item ID | decision | approver | timestamp | comment

### Screen 8 — Counterparty Risk Profiles (`CounterpartyProfilesPage`)
**Data:** `RunContext.riskItems` + `RunContext.counterpartyBriefs` — grouped by counterparty_id

Layout: search bar + cards grid (or table toggle)

Per counterparty card:
- Name + ID
- CIS status chip
- Net obligation (largest across trades)
- Lending balance %
- Last failure date
- JSE watchlist status badge
- Current risk tier (highest across their trades)
- Root cause category (from counterparty brief)
- Open trades count → link to filtered Watchlist

Trend indicator per counterparty: compare against previous run data from `/summary` risk_distribution_by_run if available, else omit.

### Screen 9 — Pipeline Monitor (enhanced `MonitorPage`)
**Existing MonitorPage + enhancements:**
- Writes all SSE data to `RunContext` (instead of only local state)
- Add data freshness row below trigger panel showing ECS/CIS/TIS snapshot timestamps (from `done` summary or `data-quality-flag` events)
- Add execution time per step (already calculated, surface more prominently)
- Keep existing: trigger panel, 7-step cards, watchlist sidebar, approval gate, raw event log

### Screen 10 — FSCA Audit Report (`AuditReportPage`)
**Data:** `RunContext.eventLog` + `RunContext.doneSummary` + `/summary` API (for run list)

Sections:
- **Run selector** — dropdown of recent runs (from `/summary` recent_runs), selected run loads its data
- **Run metadata card**: run ID, timestamp, trigger mode, execution status, data sources, coverage (trades monitored)
- **Risk assessment summary**: CRITICAL/HIGH/MEDIUM/LOW counts, distribution bar
- **Decision audit trail table**: timestamp | agent step | action | input summary | output summary | rule applied | regulatory basis
  - Populated from SSE `tool-call`, `tool-result`, `counterparty-brief`, `intervention-item`, `lolr-execution` events filtered to selected session
- **Interventions taken table**: trade ID | intervention type | rationale | estimated cost | regulatory basis
- **System health attestation**: all steps complete? data gaps? (from `done` summary)
- **Download report button**: renders current view to CSV (simple client-side download, no S3)

### Screen 11 — Rule Configuration (`RuleConfigPage`)
**Data:** local state only (no backend API)

Editable fields:
- Obligation thresholds (ZAR): CRITICAL (`> 100M`), HIGH (`> 50M`), MEDIUM (`> 20M`)
- Securities lending gap thresholds (%): HIGH (`> 20%`), MEDIUM (`> 5%`)
- Recent failure window (days, default 5)
- CIS degraded → minimum HIGH toggle
- LOLR auto-execution cap (ZAR, default 500M)
- Pipeline schedule: every N minutes (display only, not wired to backend)

Save button: persists to `localStorage` under `demo4_rule_config` (survives page reload)
Change log: last 10 edits shown below form (stored in localStorage)

Note: values shown in Risk Scoring step card on MonitorPage for context, but do not affect backend execution (backend uses hardcoded rules — UI change is display-only until backend spec is written).

### Screen 12 — Alerts & Notifications (`AlertsPage`)
**Data:** derived from `RunContext.eventLog` (systemic-risk-alert, lolr-guard-triggered events) + local state

Sections:
- **Active alerts** (unacknowledged): severity chip + message + timestamp + Acknowledge button
- **Alert history table**: severity | message | source step | session ID | timestamp | acknowledged by
- Alert preferences panel (display only): email/SMS/in-app toggles (local state, no backend)

Alerts auto-populated from SSE events: `systemic-risk-alert`, `lolr-guard-triggered`, `error`, and any `pipeline-step` with `status: 'failed'`.

---

## Implementation Checklist

- [ ] Copy this spec to `specs/demo4-ui-v2-12-screens.md` (spec-first rule)
- [ ] Create `src/types.ts` — extract all interfaces from MonitorPage + DashboardPage + define new ones (CounterpartyBrief, InterventionItem, LolrItem, RollItem, ApprovalDecision)
- [ ] Create `src/context/RunContext.tsx` — context + provider + useRun hook
- [ ] Refactor `App.tsx` — sidebar layout (220px left + flex-1 content), 12 routes, wrap in RunContextProvider, remove DashboardPage import
- [ ] Update `MonitorPage.tsx` — consume `useRun()`, write all SSE events to context via `handleEvent`, remove local state that's now in context (riskItems, pendingApprovals, eventLog), keep approve/reject logic (or move to context)
- [ ] Create `CommandCenterPage.tsx` (Screen 1) — live status bar, 4 risk tiles, systemic stress banner, pending approvals widget, system health chips, recent runs table
- [ ] Create `WatchlistPage.tsx` (Screen 2) — filter bar + sortable table, row click → `/watchlist/:tradeId`
- [ ] Create `TradeDetailPage.tsx` (Screen 3) — two-column layout, joined data from context
- [ ] Create `InterventionPlanPage.tsx` (Screen 4) — summary stats + 4 grouped sections + action buttons
- [ ] Create `LolrExecutionPage.tsx` (Screen 5) — ZAR 500M guard bar + execution log + pending approvals section
- [ ] Create `SettlementRollPage.tsx` (Screen 6) — roll log table + ineligible trades section
- [ ] Create `EscalationsPage.tsx` (Screen 7) — pending queue (with countdown) + escalated items + history
- [ ] Create `CounterpartyProfilesPage.tsx` (Screen 8) — search + counterparty cards
- [ ] Create `AuditReportPage.tsx` (Screen 10) — run selector + metadata + audit trail + download CSV
- [ ] Create `RuleConfigPage.tsx` (Screen 11) — editable thresholds, localStorage persistence
- [ ] Create `AlertsPage.tsx` (Screen 12) — active alerts + history, derived from SSE events
- [ ] Delete `DashboardPage.tsx`

---

## Verification

1. `python agents/demo4/main.py` — frontend on :8004
2. Navigate to all 12 routes — no white screens or import errors
3. Run pipeline on Pipeline Monitor (`/monitor`) — verify:
   - CommandCenter (`/`) shows live CRITICAL count updating as SSE events arrive
   - Watchlist (`/watchlist`) populates with risk items after Step 2 completes
   - Clicking a trade row opens TradeDetailPage with trade facts + counterparty brief
   - Intervention Plan (`/intervention-plan`) populates after Step 4 completes
   - LOLR Execution (`/lolr-execution`) shows 500M guard bar updating
   - Settlement Rolls (`/settlement-rolls`) shows roll entries after Step 6
   - Escalations (`/escalations`) shows pending LOLR approval; Approve button fires POST to backend
   - FSCA Audit Report (`/audit-report`) renders run audit trail
4. Rule Config (`/rules`): edit a threshold, reload page — value persists from localStorage
5. Alerts (`/alerts`): after a systemic-risk-alert SSE event, alert appears on this screen
6. Sidebar nav badge on "Human Escalations" shows count of pending approvals
7. Systemic stress banner visible on CommandCenter when `systemicRisk === true`
