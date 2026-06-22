# Spec: Runs Subsystem, Streaming Resume, HITL Wiring & Template Versioning

**Status:** approved
**Version:** v1
**Date:** 2026-05-09
**Owner:** Yaseen Mohammed
**Scope:** `agents/demo4/` + `agents/demox/` template rename. demo1/2/3 untouched.

---

## Problem

Nine related symptoms hit while operating demo4 (Settlement Failure Prevention):

1. Triggering an agent flow ties execution to the page — refreshing kills the visible run.
2. Tables show date only; full datetime needed.
3. Run ID is sometimes missing because it isn't minted until Step 7 — the LLM generates it as part of the FSCA summary.
4. No approve button is visible when human approval is needed; the gate exists in code but the UI doesn't surface it after a reconnect.
5. Agents get stuck in `running` when the process restarts mid-run; no startup sweep.
6. Templates need versioning so v1.0 and future v2.0 can coexist.
7. Live Output should resume on return to the page (replay history, then continue live).
8. Need real concurrent runs from PipelineMonitor, TestRunner, CommandCenter.
9. Need a dedicated Runs page with advanced filters; every row clickable; dashboard cards also clickable to drill-through.

demo4 already has most of the plumbing — `asyncio.create_task` at `agents/demo4/apis/routes.py:91`, `events.json` persistence at `agents/demo4/apis/service.py:167`, per-session `asyncio.Queue` at `agents/demo4/apis/service.py:156-159`, and a working HITL approval future at `agents/demo4/apis/agent_bridge.py:541-572`. This spec finishes what's started rather than rebuilding.

---

## Solution

Promote the **session** concept in demo4 to a first-class **Run**: minted at trigger time, durable event log, replayable stream, HITL gate visible from any page, sweepable on startup. Convert `events.json` (whole-file rewrite per emit) to `events.jsonl` (append-only, line-seekable). Add a dedicated `RunsPage` with filters; make tables and dashboard tiles clickable; standardise datetime rendering; rename `demox` → `demox_v1_0` and add `template_version` to all agent metadata.

---

## Scope

### In scope
- `agents/demo4/apis/`: run-id-at-trigger, events.jsonl rotation, SSE replay-from-cursor with `Last-Event-ID`, startup sweep for stranded runs, runs-list endpoint with filters, run-detail endpoint.
- `agents/demo4/frontend/src/`: RunsPage with filters; clickable rows on RunsPage and CommandCenterPage's Recent Runs table; clickable BigTile cards on CommandCenterPage; shared `formatDateTime` helper applied everywhere; useRunStream hook with auto-reconnect.
- `agents/demo4/frontend/src/pages/MonitorPage.tsx` and `TestRunnerPage.tsx`: multiple concurrent runs (each its own row/card with its own stream).
- HITL: pending-approval state survives reconnect on EscalationsPage; verify approve/reject flow end-to-end.
- Template: rename `agents/demox/` → `agents/demox_v1_0/`. Add `template_version` field to schema and all four `metadata.yaml`.
- Crash-recovery sweep at FastAPI startup.

### Not in scope
- demo1, demo2, demo3 (separate spec when needed).
- Multi-worker uvicorn deployment (single-worker constraint stays — HITL futures live in-memory).
- Database migration. Stays file-based.
- Authentication / per-user run filtering.
- Cancel button (`status="cancelled"` reserved but `POST /cancel` not implemented in v1).
- Cross-agent platform-level Runs page (would aggregate across demo1..demo4 — future spec).

---

## Architecture impact

### A. Run identity — minted at trigger

`RUN-YYYYMMDD-HHMMSS-NNNN` minted server-side at `POST /run`. NNNN is a 4-digit per-day counter (file-locked at `data/_run_seq/YYYYMMDD.txt`). The LLM-suggested `run_id` from `pipeline_summary` is dropped — minted ID is canonical.

`session_id` (UUID) and `run_id` are 1:1 — `session_id` is the URL key, `run_id` is the human-readable label. Helper `mint_run_id() -> str` in `agents/demo4/apis/service.py`; called from `create_session()` so `meta.run_id` is set before that returns.

### B. State machine

```
queued ──► running ──► awaiting_approval ──► running ──► completed
                  └──► failed
                  └──► interrupted   (process died — startup sweep)
                  └──► cancelled     (reserved; v1 unused)
```

`status` on `meta.json` becomes the authoritative run status. `execution_status` (SUCCESS/PARTIAL/FAILED) becomes a sub-classification visible only after `status == completed`. Flip to `awaiting_approval` at `agent_bridge.py:558`; flip back after `resolve_approval`.

### C. Async execution — already correct

`agents/demo4/apis/routes.py:91` already detaches via `asyncio.create_task`. No change. The visible "death on refresh" is purely client-side SSE — fixed by D below.

### D. Stream resume with replay-from-cursor

`events.json` (whole-file rewrite per emit) becomes `events.jsonl` (append-only, monotonic `id` per run). `GET /monitor/{session_id}` reads `Last-Event-ID` header (browser auto-sends on `EventSource` reconnect): replays history past the cursor, then attaches to the live `asyncio.Queue`. Frontend uses `EventSource` (native reconnect) via a new `useRunStream` hook.

Legacy `events.json` files: `get_event_log()` falls back to reading them when `events.jsonl` is missing.

### E. HITL — finish wiring + survive remount

EscalationsPage reads `pending_approvals` from `GET /pipeline/{session_id}/state` (independent of SSE) so approvals are visible after a reconnect. When entering the gate, `agent_bridge` flips `meta.status` to `awaiting_approval` and emits a `status-change` event. Approve/reject endpoints already work (`service.resolve_approval` sets the future).

The approval-future dict is process-local. Documented constraint: single uvicorn worker.

### F. Concurrent runs

Already supported (independent `asyncio.create_task` per `POST /run`). UI changes:
- **MonitorPage**: "+ New Run" button; tracked-runs list, one card per run with its own LiveOutput.
- **TestRunnerPage**: per-scenario "Run" button; independent `POST /run` per scenario.
- **RunContext**: `Map<sessionId, RunState>` — runs are first-class concurrent.

### G. Crash recovery sweep

`@app.on_event("startup")` in `agents/demo4/apis/main.py` scans `data/sessions/*_meta.json` for `status in {queued, running, awaiting_approval}` → sets `status = interrupted`, `execution_status = INTERRUPTED`, `completed_at = now()`. Single uvicorn worker means no other process owns these runs.

### H. Datetime helper

New `agents/demo4/frontend/src/lib/datetime.ts` with `formatDateTime(iso)` returning `YYYY-MM-DD HH:MM:SS`. Replace every `.slice(0, 10|16|19)` usage across the demo4 pages.

### I. Runs page

New `agents/demo4/frontend/src/pages/RunsPage.tsx`. Backend: `GET /runs?status=&trigger_mode=&started_after=&started_before=&run_id_contains=&has_systemic_stress=&limit=&offset=&sort=`. URL-bound filter UI. Auto-refresh 5s while non-terminal rows visible. **Every row clickable** → `/runs/:sessionId` (RunDetailPage with full event log + final report or live stream).

### J. Clickable dashboard tiles

On `CommandCenterPage`, wrap BigTile components in `<Link>`:
- CRITICAL/HIGH/MEDIUM/LOW → `/watchlist?classification=...`
- Value Protected → `/runs?has_value_protected=true`
- Pipeline Progress → `/monitor`
- LOLR Executed → `/lolr`
- Settlement Rolls → `/settlement-roll`
- Pending Approvals → `/escalations` (already linked)
- System Health (ECS/CIS/TIS) → `/alerts?source=...`

WatchlistPage and AlertsPage pre-filter from URL params on mount.

### K. Template versioning

Rename `agents/demox/` → `agents/demox_v1_0/`. Update Python imports, `entry_point`, internal references (CLAUDE.md, GUIDELINES.md, specs/v1-platform-restructure.md). Add `template_version: "1.0"` to all four agent `metadata.yaml` files plus the new template's. Add `template_version: str | None` to `app/schemas/agent.py` AgentSummary + AgentDetail. `app/services/agent_scanner.py` reads the field. Scanner skips on `status: template`, not folder name (already true) — add a regression test confirming this.

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Run ID source | Server-side mint at trigger | Avoids null run_id when pipeline fails before Step 7 |
| Run ID format | `RUN-YYYYMMDD-HHMMSS-NNNN` | Mirrors existing `JSE-SFPP-...` shape; readable; daily counter resets |
| `session_id` vs `run_id` | Keep both; session_id is URL key, run_id is display | Backwards-compat with existing /monitor/{session_id} routes |
| Event log format | `events.jsonl` append-only | Cheap line-seek replay; current full-rewrite is O(N²) |
| Streaming protocol | SSE with `Last-Event-ID` (no change) | Native browser reconnect; no WebSocket needed |
| Async model | `asyncio.create_task` (no change) | Already detached |
| Worker model | Single uvicorn worker | HITL futures live in-memory; documented constraint |
| Crash recovery | Startup sweep marks `running`→`interrupted` | Cheap, single-process correctness |
| Folder rename | `demox_v1_0` underscores | Python-safe |
| Template version field | `template_version: str` on metadata.yaml + schema | Records lineage; future templates v2_0 coexist |
| Runs page | New page, keep existing CommandCenter | Different audience (operator vs business) |
| Datetime helper | One shared `formatDateTime` | Single point of policy change |
| RunContext shape | `Map<sessionId, RunState>` | Concurrent runs first-class |

---

## Implementation Checklist

Order matters — each step leaves the system runnable.

### Phase 1 — Spec into repo
- [x] 1.1 Copy approved plan into `specs/runs-subsystem-and-template-versioning.md`.

### Phase 2 — Backend run subsystem (demo4)
- [ ] 2.1 `mint_run_id()` in `service.py`; called from `create_session`; drop LLM-side mint at `agent_bridge.py:667`.
- [ ] 2.2 `events.json` → `events.jsonl` append-only with monotonic `id`; legacy fallback in `get_event_log()`.
- [ ] 2.3 Status state machine: flip to `awaiting_approval` at `agent_bridge.py:558`, flip back after resolve, set `completed`/`failed` at end.
- [ ] 2.4 SSE replay-from-cursor in `routes.py monitor()`: read history filtered by `Last-Event-ID`, then attach to queue.
- [ ] 2.5 `@app.on_event("startup")` sweep in `main.py`.
- [ ] 2.6 `GET /runs` endpoint with filter query params; `GET /runs/{session_id}/detail` aggregating meta + state + recent events.

### Phase 3 — Frontend foundation
- [ ] 3.1 `agents/demo4/frontend/src/lib/datetime.ts` with `formatDateTime`.
- [ ] 3.2 Replace `.slice(0, 10|16|19)` with `formatDateTime` across pages.
- [ ] 3.3 `useRunStream` hook using `EventSource`; replace manual fetch+stream code.
- [ ] 3.4 RunContext → `Map<sessionId, RunState>`; `subscribeRun(sessionId)` and `activeRunIds`.

### Phase 4 — Frontend pages
- [ ] 4.1 New `RunsPage.tsx` with table, filters, URL-bound query state, 5s auto-refresh while non-terminal rows visible.
- [ ] 4.2 Click any row → new `RunDetailPage.tsx`.
- [ ] 4.3 Wrap CommandCenterPage BigTiles in `<Link>` to filtered destinations.
- [ ] 4.4 Click rows on CommandCenterPage's "Recent Pipeline Runs" → RunDetailPage.
- [ ] 4.5 MonitorPage: N concurrent runs, one card per run, "+ New Run" button.
- [ ] 4.6 TestRunnerPage: per-scenario "Run" button starts independent run.
- [ ] 4.7 EscalationsPage: confirm approve/reject end-to-end after reconnect.
- [ ] 4.8 Add `/runs` and `/runs/:sessionId` routes + nav link in App.tsx.

### Phase 5 — Template versioning
- [ ] 5.1 Rename `agents/demox/` → `agents/demox_v1_0/`. Update `entry_point`, internal imports, `routes.py:13` agent value, `main.py:6,59` uvicorn strings.
- [ ] 5.2 Add `template_version: "1.0"` to all four agent `metadata.yaml` files and `demox_v1_0/metadata.yaml`.
- [ ] 5.3 Add `template_version` to `app/schemas/agent.py` AgentSummary + AgentDetail.
- [ ] 5.4 Update `app/services/agent_scanner.py` to read the field.
- [ ] 5.5 Add scanner regression test confirming `status: template` skip works regardless of folder name.
- [ ] 5.6 Update CLAUDE.md, `agents/demox_v1_0/GUIDELINES.md`. Addendum to `specs/v1-platform-restructure.md`.

---

## Verification

1. **Async survives refresh.** Start a run from MonitorPage. While in Step 3, refresh. Live Output reattaches; events 1..(now) replay then live continues.
2. **Run ID at start.** `POST /run` response includes `run_id` matching `RUN-YYYYMMDD-HHMMSS-NNNN`. Crash mid-run; on restart, `GET /runs` shows that run with `status: interrupted` and run_id present.
3. **HITL visible and resumable.** Trigger a run with HUMAN_ESCALATION. Approve button visible on EscalationsPage. Click approve → status flips to `running`, pipeline proceeds. Refresh during awaiting_approval — approval card still visible.
4. **Datetime everywhere.** Every demo4 page shows `YYYY-MM-DD HH:MM:SS`, never date-only.
5. **Concurrent runs.** From TestRunnerPage start 3 scenarios. All 3 progress in parallel; each LiveOutput streams independently.
6. **RunsPage filters.** `/runs?status=running,awaiting_approval&trigger_mode=upload` filters correctly. URL is shareable. Click row → RunDetailPage.
7. **Clickable dashboard tiles.** Click CRITICAL tile → `/watchlist?classification=CRITICAL` pre-filtered.
8. **Clickable run rows.** Click any row in CommandCenter "Recent Pipeline Runs" → RunDetailPage.
9. **Stuck-running prevention.** Kill uvicorn mid-run, restart. `GET /runs` shows `status: interrupted`.
10. **Template versioning.** `GET /api/agents` returns `template_version: "1.0"` for every agent. Folder is `agents/demox_v1_0/`. Scanner regression test passes.
11. **No regressions.** All existing demo4 pages still load; existing `data/sessions/*` runs still appear in RunsPage.

---

## Risks

- Strands `agent.stream_async` blocking inside a tool — demo4 already runs sub-agents via `asyncio.to_thread()` (`agent_bridge.py:176`) so the gate awaits an `asyncio.Future` outside the thread. Verify with one HITL test run.
- Existing `events.json` files need a one-shot legacy fallback in `get_event_log` so RunsPage shows history for them.
- `events.jsonl` unbounded growth: soft cap 50MB per run; on overflow append `{"type":"log-truncated"}`. v1: don't rotate.
- Daily run-id counter race: mirror existing `threading.Lock` pattern from demo1 csv_store for `data/_run_seq/YYYYMMDD.txt`.
- Folder rename: external scripts referencing `agents/demox` — grep is clean per exploration.
