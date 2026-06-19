"""Step 7: Reporting & Audit Agent — compiles FSCA reports and updates dashboard."""
from __future__ import annotations

from strands import Agent, tool

from ..prompts import REPORTING_AUDIT_SYSTEM_PROMPT
from ..tools.audit_tools import (
    write_audit_log, update_operations_dashboard,
    send_operations_alert, store_fsca_report, compare_with_prior_cycle,
)


def _make_agent() -> Agent:
    from ..model import get_model
    return Agent(
        model=get_model(),
        system_prompt=REPORTING_AUDIT_SYSTEM_PROMPT,
        tools=[
            compare_with_prior_cycle, write_audit_log,
            update_operations_dashboard, send_operations_alert, store_fsca_report,
        ],
    )


@tool
def reporting_audit_agent(pipeline_context: str) -> str:
    """
    Step 7 of the JSE settlement failure prevention pipeline (always executes).

    Compiles a full execution report, writes an immutable audit trail, updates the
    JSE operations dashboard, sends critical alerts to on-call team, and produces
    an FSCA-compliant compliance report stored in S3. Compares with the prior cycle
    to identify deterioration trends and systemic stress indicators.

    Args:
        pipeline_context: JSON string containing all previous step outputs:
                          settlement_exposure_snapshot, settlement_watchlist,
                          counterparty_risk_assessment, intervention_plan,
                          lolr_execution_report, roll_execution_report.

    Returns:
        JSON string with key "pipeline_summary" containing run_id, execution_status,
        operations_summary, systemic_stress_indicator, and trend_direction.
    """
    return str(_make_agent()(
        f"Compile the full audit report and FSCA compliance document for this pipeline run. "
        f"Pipeline context:\n{pipeline_context}\n\n"
        f"Generate a run_id in format JSE-SFPP-YYYYMMDD-HHMM using today's date and current time. "
        f"Call compare_with_prior_cycle, write_audit_log, update_operations_dashboard. "
        f"If any CRITICAL items or escalations exist, call send_operations_alert with severity=HIGH. "
        f"Call store_fsca_report with the full compliance document. "
        f"Return ONLY valid JSON — no text before or after the JSON object. "
        f"Include 'pipeline_summary' AND an 'agent_reasoning' array (3-6 strings) "
        f"explaining: trend vs prior cycle, systemic stress determination, notable compliance "
        f"observations, intervention effectiveness summary."
    ))
