"""
Async pipeline runner for the Settlement Failure Prevention Agent.

Drives the 7-step pipeline sequentially, emitting SSE events between each step.
Handles the human approval gate for LOLR items requiring manual review.
All Strands Agent calls run in a thread pool via asyncio.to_thread().
"""
from __future__ import annotations

import asyncio
import json
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from commons.logger import get_logger  # noqa: E402
from .service import PipelineService  # noqa: E402

# Sub-agent functions (called directly — not via orchestrator LLM)
from agents.demo4.agentic.sub_agents.data_ingestion import data_ingestion_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.risk_scoring import risk_scoring_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.counterparty_risk import counterparty_risk_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.intervention_decision import intervention_decision_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.lolr_execution import lolr_execution_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.settlement_roll import settlement_roll_agent  # noqa: E402
from agents.demo4.agentic.sub_agents.reporting_audit import reporting_audit_agent  # noqa: E402
from agents.demo4.agentic.tools.mock_data import set_thread_session, clear_session_scenario  # noqa: E402

logger = get_logger(__name__)


def _in_thread(session_id: str, fn, *args):
    """Run fn(*args) inside a thread with the session context set for mock_data tools."""
    set_thread_session(session_id)
    return fn(*args)


_STEP_NAMES = {
    1: "DataIngestionAgent",
    2: "RiskScoringAgent",
    3: "CounterpartyRiskAgent",
    4: "InterventionDecisionAgent",
    5: "LOLRExecutionAgent",
    6: "SettlementRollAgent",
    7: "ReportingAuditAgent",
}

LOLR_GUARD_LIMIT_ZAR = 500_000_000


def _extract_json(text: str) -> dict | list:
    """
    Extract JSON from LLM response text.
    Strips markdown code fences if present, then parses.
    """
    text = text.strip()
    # Strip markdown code block if present
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last line (``` markers)
        inner = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = inner.strip()
    # Find first { or [
    for start_char, end_char in [('{', '}'), ('[', ']')]:
        idx = text.find(start_char)
        if idx != -1:
            # Find matching end
            try:
                return json.loads(text[idx:])
            except json.JSONDecodeError:
                pass
    # Try the whole thing
    return json.loads(text)


def _safe_json(text: str, fallback_key: str = "data") -> dict:
    """Parse JSON from agent output; wrap raw text in a dict on failure."""
    try:
        result = _extract_json(text)
        if isinstance(result, dict):
            return result
        return {fallback_key: result}
    except Exception:
        return {fallback_key: text[:500]}


async def run_pipeline(session_id: str, trigger_input: dict, service: PipelineService) -> None:
    """
    Execute the full 7-step settlement failure prevention pipeline.

    Emits SSE events to the session queue at each step transition.
    Handles human approval gate for LOLR items.
    Always runs Step 7 (audit/reporting) regardless of pipeline outcome.
    """
    now = datetime.now(timezone.utc)

    async def emit(event: dict) -> None:
        await service.emit(session_id, event)

    async def step_start(step: int) -> None:
        name = _STEP_NAMES[step]
        service.update_step(session_id, step, status="running",
                            started_at=datetime.now(timezone.utc).isoformat())
        await emit({"type": "pipeline-step", "step": step, "agent": name, "status": "running"})
        logger.info("[BRIDGE] step_start  session_id=%s step=%d agent=%s", session_id, step, name)

    async def step_complete(step: int, output_summary: str = "", output: dict | None = None) -> None:
        name = _STEP_NAMES[step]
        elapsed = (datetime.now(timezone.utc) - now).total_seconds()
        service.update_step(session_id, step, status="complete",
                            completed_at=datetime.now(timezone.utc).isoformat(),
                            output_summary=output_summary,
                            output=output)
        await emit({"type": "pipeline-step", "step": step, "agent": name,
                    "status": "complete", "output_summary": output_summary})
        logger.info("[BRIDGE] step_complete  session_id=%s step=%d summary=%s", session_id, step, output_summary)

    async def step_skip(step: int, reason: str = "") -> None:
        name = _STEP_NAMES[step]
        service.update_step(session_id, step, status="skipped", output_summary=reason)
        await emit({"type": "pipeline-step", "step": step, "agent": name,
                    "status": "skipped", "reason": reason})

    async def step_fail(step: int, error: str) -> None:
        name = _STEP_NAMES[step]
        service.update_step(session_id, step, status="failed", error=error)
        await emit({"type": "pipeline-step", "step": step, "agent": name,
                    "status": "failed", "error": error})

    # Pipeline context — accumulates outputs across steps
    ctx: dict = {}
    pipeline_ok = True
    execution_status = "SUCCESS"

    service.update_session(session_id, status="running")
    service.set_pipeline_field(session_id, status="running")

    # ── Step 1: Data Ingestion ─────────────────────────────────────────────────
    await step_start(1)
    await emit({"type": "tool-call", "step": 1, "tool": "get_tis_open_trades", "status": "running"})
    await emit({"type": "tool-call", "step": 1, "tool": "get_ecs_clearing_positions", "status": "running"})
    await emit({"type": "tool-call", "step": 1, "tool": "get_cis_counterparty_data", "status": "running"})
    try:
        trigger_str = json.dumps(trigger_input)
        raw1 = await asyncio.to_thread(_in_thread, session_id, data_ingestion_agent, trigger_str)
        ctx["step1_raw"] = str(raw1)
        parsed1 = _safe_json(str(raw1), "settlement_exposure_snapshot")
        snapshot = parsed1.get("settlement_exposure_snapshot", parsed1)
        ctx["exposure_snapshot"] = snapshot

        t1_count = len(snapshot.get("t1_trades", []))
        t2_count = len(snapshot.get("t2_trades", []))
        flags = snapshot.get("data_quality_flags", [])
        summary1 = f"{t1_count + t2_count} trades ({t1_count} T+1, {t2_count} T+2), {len(flags)} quality flags"
        await emit({"type": "tool-result", "step": 1, "tool": "get_tis_open_trades",
                    "preview": f"{t1_count + t2_count} trades loaded"})
        await step_complete(1, summary1, snapshot)
    except Exception as e:
        logger.error("[BRIDGE] step1_failed  session_id=%s error=%s", session_id, e)
        await step_fail(1, str(e))
        await emit({"type": "error", "message": f"Step 1 data ingestion failed: {e}"})
        pipeline_ok = False
        execution_status = "FAILED"

    # Skip Steps 2–6 if Step 1 failed, but still run Step 7
    if not pipeline_ok:
        for step in [2, 3, 4, 5, 6]:
            await step_skip(step, "Skipped: upstream step 1 failed")
    else:
        # ── Step 2: Risk Scoring ───────────────────────────────────────────────
        await step_start(2)
        await emit({"type": "tool-call", "step": 2, "tool": "get_market_volatility_context", "status": "running"})
        await emit({"type": "tool-call", "step": 2, "tool": "get_historical_failure_rates", "status": "running"})
        try:
            raw2 = await asyncio.to_thread(_in_thread, session_id, risk_scoring_agent, json.dumps(snapshot))
            ctx["step2_raw"] = str(raw2)
            parsed2 = _safe_json(str(raw2), "settlement_watchlist")
            watchlist_data = parsed2.get("settlement_watchlist", parsed2 if isinstance(parsed2, list) else [])
            ctx["watchlist"] = watchlist_data

            # Count by risk tier
            counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
            for item in watchlist_data:
                tier = item.get("risk_classification", "LOW")
                counts[tier] = counts.get(tier, 0) + 1

            service.update_session(session_id,
                                   critical_count=counts["CRITICAL"],
                                   high_count=counts["HIGH"],
                                   medium_count=counts["MEDIUM"],
                                   low_count=counts["LOW"])
            service.set_pipeline_field(session_id, risk_summary=counts)

            # Emit individual risk items
            for item in watchlist_data:
                await emit({
                    "type": "risk-item",
                    "trade_id": item.get("trade_id", ""),
                    "counterparty_id": item.get("counterparty_id", ""),
                    "counterparty_name": item.get("counterparty_name", ""),
                    "classification": item.get("risk_classification", "LOW"),
                    "net_obligation_zar": item.get("net_obligation_zar", 0),
                    "rationale": item.get("classification_rationale", ""),
                    "rule_triggers": item.get("rule_triggers", []),
                })

            summary2 = (f"{counts['CRITICAL']} CRITICAL / {counts['HIGH']} HIGH / "
                        f"{counts['MEDIUM']} MEDIUM / {counts['LOW']} LOW")
            await step_complete(2, summary2, {"settlement_watchlist": watchlist_data, "counts": counts})
        except Exception as e:
            logger.error("[BRIDGE] step2_failed  session_id=%s error=%s", session_id, e)
            await step_fail(2, str(e))
            watchlist_data = []
            counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
            execution_status = "PARTIAL"

        high_critical = [i for i in watchlist_data if i.get("risk_classification") in ("CRITICAL", "HIGH")]

        if not high_critical:
            for step in [3, 4, 5, 6]:
                await step_skip(step, "No HIGH or CRITICAL items — no intervention required")
        else:
            # ── Step 3: Counterparty Risk ──────────────────────────────────────
            await step_start(3)
            try:
                raw3 = await asyncio.to_thread(
                    _in_thread, session_id, counterparty_risk_agent,
                    json.dumps({"settlement_watchlist": watchlist_data})
                )
                ctx["step3_raw"] = str(raw3)
                parsed3 = _safe_json(str(raw3), "counterparty_risk_assessment")
                risk_assessment = parsed3.get("counterparty_risk_assessment", [])
                systemic_flag = parsed3.get("systemic_risk_flag", False)
                ctx["risk_assessment"] = risk_assessment
                ctx["systemic_risk_flag"] = systemic_flag

                service.update_session(session_id, systemic_stress=systemic_flag)
                service.set_pipeline_field(session_id, systemic_risk_flag=systemic_flag)

                for brief in risk_assessment:
                    await emit({
                        "type": "counterparty-brief",
                        "counterparty_id": brief.get("counterparty_id", ""),
                        "counterparty_name": brief.get("counterparty_name", ""),
                        "root_cause": brief.get("root_cause_category", "UNKNOWN"),
                        "urgency": brief.get("intervention_urgency", "STANDARD"),
                        "recommended": brief.get("recommended_intervention_type", "ALERT"),
                    })

                flag_note = " [SYSTEMIC RISK FLAG]" if systemic_flag else ""
                summary3 = f"{len(risk_assessment)} counterparties analysed{flag_note}"
                await step_complete(3, summary3, parsed3)
            except Exception as e:
                logger.error("[BRIDGE] step3_failed  session_id=%s error=%s", session_id, e)
                await step_fail(3, str(e))
                risk_assessment = []
                systemic_flag = False
                execution_status = "PARTIAL"

            # ── Step 4: Intervention Decision ──────────────────────────────────
            await step_start(4)
            try:
                risk_ctx_input = json.dumps({
                    "settlement_watchlist": watchlist_data,
                    "counterparty_risk_assessment": risk_assessment,
                    "systemic_risk_flag": systemic_flag,
                })
                raw4 = await asyncio.to_thread(_in_thread, session_id, intervention_decision_agent, risk_ctx_input)
                ctx["step4_raw"] = str(raw4)
                parsed4 = _safe_json(str(raw4), "intervention_plan")
                intervention_plan = parsed4.get("intervention_plan", parsed4)
                plan_items = intervention_plan.get("items", []) if isinstance(intervention_plan, dict) else []
                plan_summary = intervention_plan.get("plan_summary", {}) if isinstance(intervention_plan, dict) else {}
                ctx["intervention_plan"] = intervention_plan
                service.set_pipeline_field(session_id, intervention_plan=intervention_plan)

                for item in plan_items:
                    await emit({
                        "type": "intervention-item",
                        "trade_id": item.get("trade_id", ""),
                        "counterparty_id": item.get("counterparty_id", ""),
                        "intervention_type": item.get("intervention_type", ""),
                        "requires_human_approval": item.get("requires_human_approval", False),
                        "estimated_cost_zar": item.get("estimated_cost_zar", 0),
                        "rationale": item.get("intervention_rationale", ""),
                    })

                by_type: dict[str, int] = {}
                for item in plan_items:
                    t = item.get("intervention_type", "UNKNOWN")
                    by_type[t] = by_type.get(t, 0) + 1
                summary4 = " | ".join(f"{v}× {k}" for k, v in by_type.items())
                await step_complete(4, summary4 or "No interventions", parsed4)
            except Exception as e:
                logger.error("[BRIDGE] step4_failed  session_id=%s error=%s", session_id, e)
                await step_fail(4, str(e))
                plan_items = []
                systemic_flag = True  # Treat as systemic on error — skip auto-execution
                execution_status = "PARTIAL"

            # ── Steps 5 & 6 (skipped if systemic_risk_flag) ───────────────────
            if systemic_flag:
                await step_skip(5, "Skipped: systemic_risk_flag — all CRITICAL items require human review")
                await step_skip(6, "Skipped: systemic_risk_flag — all CRITICAL items require human review")
                await emit({
                    "type": "systemic-risk-alert",
                    "message": "Systemic risk flag active — automated execution suspended. Human review required for all CRITICAL items.",
                })
            else:
                # ── Step 5: LOLR Execution ─────────────────────────────────────
                lolr_items = [i for i in plan_items if i.get("intervention_type") == "LOLR_TRIGGER"]
                if not lolr_items:
                    await step_skip(5, "No LOLR_TRIGGER items in intervention plan")
                else:
                    await step_start(5)

                    # Human approval gate — emit events and await futures
                    items_needing_approval = [i for i in lolr_items if i.get("requires_human_approval")]
                    approved_items = [i for i in lolr_items if not i.get("requires_human_approval")]
                    rejected_items = []

                    for item in items_needing_approval:
                        item_id = item.get("trade_id", str(id(item)))
                        approval_payload = {
                            "type": "human-approval-required",
                            "item_id": item_id,
                            "trade_id": item.get("trade_id", ""),
                            "counterparty_id": item.get("counterparty_id", ""),
                            "isin": item.get("isin", ""),
                            "intervention_type": "LOLR_TRIGGER",
                            "value_zar": item.get("estimated_cost_zar", 0),
                            "rationale": item.get("intervention_rationale", ""),
                            "reason": "Requires human approval per JSE rules",
                        }
                        service.add_pending_approval(session_id, approval_payload)
                        await emit(approval_payload)
                        logger.info("[BRIDGE] awaiting_approval  session_id=%s item_id=%s", session_id, item_id)

                        future = service.create_approval_future(session_id, item_id)
                        try:
                            decision = await asyncio.wait_for(future, timeout=1200)  # 20-min timeout
                        except asyncio.TimeoutError:
                            decision = "reject"
                            await emit({"type": "approval-timeout", "item_id": item_id,
                                        "message": "Approval timeout — item escalated to human review"})

                        service.remove_pending_approval(session_id, item_id)
                        if decision == "approve":
                            approved_items.append({**item, "requires_human_approval": False})
                            await emit({"type": "approval-decision", "item_id": item_id, "decision": "approved"})
                        else:
                            rejected_items.append(item_id)
                            await emit({"type": "approval-decision", "item_id": item_id, "decision": "rejected"})

                    lolr_exec_result: dict = {}
                    if approved_items:
                        # Enforce ZAR 500M guard
                        total_value = 0
                        capped_items = []
                        for item in sorted(approved_items, key=lambda x: x.get("execution_priority", 99)):
                            val = item.get("estimated_cost_zar", 0) or 0
                            if total_value + val > LOLR_GUARD_LIMIT_ZAR:
                                await emit({
                                    "type": "lolr-guard-triggered",
                                    "message": f"ZAR 500M guard reached — {item.get('trade_id')} held for human approval",
                                    "item_id": item.get("trade_id"),
                                })
                                break
                            capped_items.append(item)
                            total_value += val

                        try:
                            raw5 = await asyncio.to_thread(_in_thread, session_id, lolr_execution_agent, json.dumps(capped_items))
                            ctx["step5_raw"] = str(raw5)
                            parsed5 = _safe_json(str(raw5), "lolr_execution_report")
                            lolr_exec_result = parsed5.get("lolr_execution_report", parsed5)
                            ctx["lolr_report"] = lolr_exec_result
                            successes = lolr_exec_result.get("successful_executions", len(capped_items))
                            total_zar = lolr_exec_result.get("total_value_zar", total_value)
                            summary5 = f"{successes} LOLR transactions confirmed, ZAR {total_zar:,} total"
                            await step_complete(5, summary5, parsed5)
                        except Exception as e:
                            logger.error("[BRIDGE] step5_failed  session_id=%s error=%s", session_id, e)
                            await step_fail(5, str(e))
                            execution_status = "PARTIAL"
                    else:
                        await step_complete(5, "All LOLR items rejected or timed out — no executions")

                # ── Step 6: Settlement Roll ────────────────────────────────────
                roll_items = [i for i in plan_items if i.get("intervention_type") == "SETTLEMENT_ROLL"]
                if not roll_items:
                    await step_skip(6, "No SETTLEMENT_ROLL items in intervention plan")
                else:
                    await step_start(6)
                    try:
                        raw6 = await asyncio.to_thread(_in_thread, session_id, settlement_roll_agent, json.dumps(roll_items))
                        ctx["step6_raw"] = str(raw6)
                        parsed6 = _safe_json(str(raw6), "roll_execution_report")
                        roll_report = parsed6.get("roll_execution_report", parsed6)
                        ctx["roll_report"] = roll_report
                        successes = roll_report.get("successful_rolls", len(roll_items))
                        summary6 = f"{successes} settlement rolls submitted to Strate"
                        await step_complete(6, summary6, parsed6)
                    except Exception as e:
                        logger.error("[BRIDGE] step6_failed  session_id=%s error=%s", session_id, e)
                        await step_fail(6, str(e))
                        execution_status = "PARTIAL"

    # ── Step 7: Reporting & Audit (ALWAYS) ────────────────────────────────────
    await step_start(7)
    try:
        pipeline_ctx_str = json.dumps({
            "settlement_exposure_snapshot": ctx.get("exposure_snapshot"),
            "settlement_watchlist": ctx.get("watchlist"),
            "counterparty_risk_assessment": ctx.get("risk_assessment"),
            "intervention_plan": ctx.get("intervention_plan"),
            "lolr_execution_report": ctx.get("lolr_report"),
            "roll_execution_report": ctx.get("roll_report"),
            "execution_status": execution_status,
        })
        raw7 = await asyncio.to_thread(_in_thread, session_id, reporting_audit_agent, pipeline_ctx_str)
        ctx["step7_raw"] = str(raw7)
        parsed7 = _safe_json(str(raw7), "pipeline_summary")
        pipeline_summary = parsed7.get("pipeline_summary", parsed7)
        ctx["pipeline_summary"] = pipeline_summary

        run_id = pipeline_summary.get("run_id", f"JSE-SFPP-{datetime.now().strftime('%Y%m%d-%H%M')}")
        ops_summary = pipeline_summary.get("operations_summary", {})

        service.set_pipeline_field(session_id,
                                   status="complete",
                                   fsca_report=pipeline_summary,
                                   completed_at=datetime.now(timezone.utc).isoformat(),
                                   operations_summary=ops_summary)

        service.update_session(session_id,
                               status="complete",
                               execution_status=execution_status,
                               run_id=run_id,
                               completed_at=datetime.now(timezone.utc).isoformat(),
                               interventions_executed=ops_summary.get("total_interventions", 0))

        summary7 = f"Run {run_id} — {execution_status}"
        await step_complete(7, summary7, parsed7)

        await emit({
            "type": "done",
            "run_id": run_id,
            "execution_status": execution_status,
            "summary": ops_summary,
            "systemic_stress": ctx.get("systemic_risk_flag", False),
        })
    except Exception as e:
        logger.error("[BRIDGE] step7_failed  session_id=%s error=%s", session_id, e)
        await step_fail(7, str(e))
        await emit({
            "type": "done",
            "run_id": f"JSE-SFPP-{datetime.now().strftime('%Y%m%d-%H%M')}",
            "execution_status": "FAILED",
            "error": str(e),
        })

    clear_session_scenario(session_id)
    logger.info("[BRIDGE] pipeline_complete  session_id=%s status=%s", session_id, execution_status)
