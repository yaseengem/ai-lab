"""FastAPI route handlers for the Settlement Failure Prevention Agent."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from .schemas import ApprovalRequest, RunRequest, SessionSummary
from .service import PipelineService
from .agent_bridge import run_pipeline

from commons.logger import get_logger

logger = get_logger(__name__)

router = APIRouter()
service = PipelineService()

_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
_ALLOWED_SUFFIXES = {".csv", ".json"}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/ping")
def ping():
    return {"status": "ok", "agent": "nexus-settlement-prevention"}


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    """
    Upload a settlement exposure data file (CSV or JSON).
    Returns upload_id to pass to POST /run.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{suffix}'. Use .csv or .json")
    contents = await file.read()
    if len(contents) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit.")
    upload_id = service.save_upload(file.filename or "upload.csv", contents)
    return {"upload_id": upload_id, "filename": file.filename, "bytes": len(contents)}


# ── Run ───────────────────────────────────────────────────────────────────────

@router.post("/run")
async def run(req: RunRequest):
    """
    Start a pipeline run.

    mode='api': Uses mock data from Section 6.2 of the UC8 spec.
    mode='upload': Uses the uploaded file referenced by upload_id.

    Returns session_id to connect to GET /monitor/{session_id} for SSE stream.
    """
    logger.info("[ROUTE] POST /run  mode=%s upload_id=%s", req.mode, req.upload_id)

    trigger_input: dict = {"mode": req.mode, "use_mock": req.use_mock}

    if req.mode == "upload":
        if not req.upload_id:
            raise HTTPException(status_code=400, detail="upload_id required for upload mode")
        upload_path = service.get_upload_path(req.upload_id)
        if not upload_path:
            raise HTTPException(status_code=404, detail=f"Upload {req.upload_id} not found")
        try:
            contents = upload_path.read_text(encoding="utf-8")
            if upload_path.suffix.lower() == ".json":
                trigger_input["data"] = json.loads(contents)
            else:
                # Parse CSV into basic trade/counterparty structure
                trigger_input["data"] = _parse_csv_upload(contents)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Failed to parse upload: {e}")

    meta = service.create_session(trigger_mode=req.mode, upload_id=req.upload_id)
    session_id = meta["session_id"]

    # Start pipeline as background asyncio task — detached from the HTTP request,
    # so client disconnect (refresh, navigation) does NOT cancel the run.
    asyncio.create_task(run_pipeline(session_id, trigger_input, service))
    logger.info("[ROUTE] pipeline_started  session_id=%s run_id=%s", session_id, meta["run_id"])

    return {
        "session_id": session_id,
        "run_id": meta["run_id"],
        "status": meta["status"],
        "created_at": meta["created_at"],
    }


def _parse_csv_upload(content: str) -> dict:
    """Parse a simple CSV upload into exposure snapshot format."""
    reader = csv.DictReader(io.StringIO(content))
    trades = []
    for row in reader:
        trades.append({
            "trade_id": row.get("trade_id", str(uuid.uuid4())[:8]),
            "counterparty_id": row.get("counterparty_id", "UNKNOWN"),
            "isin": row.get("isin", ""),
            "instrument": row.get("instrument", ""),
            "settlement_window": row.get("settlement_window", "T+1"),
            "value_zar": int(float(row.get("value_zar", "0"))),
            "quantity": int(float(row.get("quantity", "0"))),
            "side": row.get("side", "BUY"),
        })
    return {"trades": trades, "source": "upload"}


# ── Monitor (SSE stream) ──────────────────────────────────────────────────────

_TERMINAL_RUN_STATUSES = {"complete", "failed", "interrupted", "cancelled"}


@router.get("/monitor/{session_id}")
async def monitor(session_id: str, last_event_id: Optional[str] = Header(None, alias="Last-Event-ID")):
    """
    Server-Sent Events stream for a pipeline run.

    Connect after POST /run. Events are emitted for each pipeline step, tool call,
    risk item, intervention decision, and human approval gate. Stream ends with
    {"type": "done"} or {"type": "error"}.

    Reconnect-resume: on reconnect, the browser auto-sends `Last-Event-ID` (the
    monotonic id we stamp on each persisted event). The handler replays history
    past that cursor, then attaches to the live in-memory queue. The first
    connection in a fresh process sends Last-Event-ID=0 implicitly and replays
    everything that's already been written to events.jsonl.
    """
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        cursor = int(last_event_id) if last_event_id else 0
    except ValueError:
        cursor = 0

    async def event_stream():
        # 1) Replay persisted events past the cursor.
        history = service.get_event_log(session_id, after_id=cursor)
        for record in history:
            eid = record.get("id")
            if eid is None:
                yield f"data: {json.dumps(record)}\n\n"
            else:
                yield f"id: {eid}\ndata: {json.dumps(record)}\n\n"

        # 2) If the run is already terminal AND we've emitted everything, send a
        #    terminal marker and close. The browser stops auto-reconnecting once
        #    the connection ends after a `done` event.
        meta = service.get_session(session_id) or {}
        if meta.get("status") in _TERMINAL_RUN_STATUSES:
            event_count = int(meta.get("event_count", 0))
            if cursor + len(history) >= event_count:
                yield f"data: {json.dumps({'type': 'already-complete', 'status': meta.get('status')})}\n\n"
                return

        # 3) Attach to live queue for in-progress runs. We drain the queue
        #    skipping anything we've already replayed (could happen if the
        #    queue was populated faster than the file was flushed in tests).
        queue = service.get_or_create_queue(session_id)
        seen_ids: set[int] = {r.get("id") for r in history if isinstance(r.get("id"), int)}
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                continue
            eid = event.get("id") if isinstance(event, dict) else None
            if isinstance(eid, int):
                if eid in seen_ids or eid <= cursor:
                    continue
                seen_ids.add(eid)
                yield f"id: {eid}\ndata: {json.dumps(event)}\n\n"
            else:
                yield f"data: {json.dumps(event)}\n\n"
            if isinstance(event, dict) and event.get("type") in ("done", "error"):
                break

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Approval gate ─────────────────────────────────────────────────────────────

@router.post("/approve/{session_id}/{item_id}")
async def approve(session_id: str, item_id: str, req: ApprovalRequest):
    """Approve a LOLR item that is pending human review."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, item_id, "approve")
    if not resolved:
        raise HTTPException(status_code=404, detail=f"No pending approval for item {item_id}")
    logger.info("[ROUTE] POST /approve/%s/%s  approver=%s", session_id, item_id, req.approver_id)
    return {"session_id": session_id, "item_id": item_id, "decision": "approved"}


@router.post("/reject/{session_id}/{item_id}")
async def reject(session_id: str, item_id: str, req: ApprovalRequest):
    """Reject a LOLR item — escalates to HUMAN_ESCALATION."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    resolved = service.resolve_approval(session_id, item_id, "reject")
    if not resolved:
        raise HTTPException(status_code=404, detail=f"No pending approval for item {item_id}")
    logger.info("[ROUTE] POST /reject/%s/%s  approver=%s", session_id, item_id, req.approver_id)
    return {"session_id": session_id, "item_id": item_id, "decision": "rejected"}


# ── Session queries ───────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions():
    """List all pipeline runs ordered by most recent first."""
    return service.list_sessions()


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    """Return metadata for a single pipeline run."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/pipeline/{session_id}/state")
def get_pipeline_state(session_id: str):
    """
    Return the full structured pipeline state for a session:
    step statuses, outputs, pending approvals, risk summary, intervention plan.
    """
    state = service.get_pipeline_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Pipeline state not found")
    return state


@router.get("/report/{session_id}")
def get_report(session_id: str):
    """Return the FSCA compliance report for a completed pipeline run."""
    state = service.get_pipeline_state(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Pipeline state not found")
    report = state.get("fsca_report")
    if not report:
        raise HTTPException(status_code=404, detail="Report not yet generated — pipeline may still be running")
    return report


# ── Event log ─────────────────────────────────────────────────────────────────

@router.get("/pipeline/{session_id}/events")
def get_pipeline_events(session_id: str):
    """Return the full SSE event log for a completed pipeline run."""
    session = service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"events": service.get_event_log(session_id)}


# ── Summary dashboard ─────────────────────────────────────────────────────────

@router.get("/summary")
def get_summary():
    """
    Aggregate statistics across all pipeline runs for the Summary Dashboard.
    Includes risk distribution by run, intervention breakdown, and trend data.
    """
    return service.get_summary()


# ── Runs page (filters + detail) ─────────────────────────────────────────────

def _csv_or_none(s: Optional[str]) -> Optional[list[str]]:
    if not s:
        return None
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return parts or None


@router.get("/runs")
def list_runs(
    status: Optional[str] = Query(None, description="Comma-separated list of statuses"),
    trigger_mode: Optional[str] = Query(None, description="Comma-separated list of trigger modes"),
    run_id_contains: Optional[str] = None,
    started_after: Optional[str] = None,
    started_before: Optional[str] = None,
    has_systemic_stress: Optional[bool] = None,
    sort: str = "created_at:desc",
    limit: int = 50,
    offset: int = 0,
):
    """
    Filter+paginate runs for the RunsPage. All filters are optional and combined
    with AND semantics. Multi-value filters (status, trigger_mode) accept
    comma-separated strings.
    """
    return service.list_runs(
        status=_csv_or_none(status),
        trigger_mode=_csv_or_none(trigger_mode),
        run_id_contains=run_id_contains,
        started_after=started_after,
        started_before=started_before,
        has_systemic_stress=has_systemic_stress,
        sort=sort,
        limit=max(1, min(limit, 500)),
        offset=max(0, offset),
    )


@router.get("/runs/{session_id}/detail")
def get_run_detail(session_id: str, events_limit: int = 200):
    """
    Aggregated payload for the RunDetailPage:
    - meta (run-level summary, status, run_id)
    - state (pipeline steps, pending_approvals, intervention_plan, fsca_report)
    - events (most recent N events from events.jsonl)
    """
    detail = service.get_run_detail(session_id, events_limit=events_limit)
    if detail is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return detail
