"""Pydantic schemas for the Settlement Failure Prevention Agent API."""
from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel


class RunRequest(BaseModel):
    mode: str = "api"           # "api" | "upload"
    upload_id: Optional[str] = None
    use_mock: bool = True


class ApprovalRequest(BaseModel):
    decision: str = "approve"   # "approve" | "reject"
    approver_id: str = "ops-user"
    notes: Optional[str] = None


class SessionSummary(BaseModel):
    session_id: str
    run_id: Optional[str] = None
    trigger_mode: str = "api"
    status: str = "pending"     # pending | running | complete | failed
    execution_status: Optional[str] = None
    created_at: str
    completed_at: Optional[str] = None
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    interventions_executed: int = 0
    systemic_stress: bool = False


class PipelineStepState(BaseModel):
    step: int
    agent_name: str
    status: str = "waiting"     # waiting | running | complete | skipped | failed
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None
    output_summary: Optional[str] = None
    output: Optional[Any] = None
    error: Optional[str] = None


class PipelineState(BaseModel):
    session_id: str
    run_id: Optional[str] = None
    status: str = "pending"
    trigger_mode: str = "api"
    steps: list[PipelineStepState] = []
    pending_approvals: list[dict] = []
    risk_summary: Optional[dict] = None
    intervention_plan: Optional[dict] = None
    fsca_report: Optional[dict] = None
    created_at: str
    completed_at: Optional[str] = None


class SummaryStats(BaseModel):
    total_runs: int = 0
    total_trades_monitored: int = 0
    avg_critical_per_run: float = 0.0
    total_lolr_executed: int = 0
    total_rolls_executed: int = 0
    total_alerts_sent: int = 0
    total_human_escalations: int = 0
    total_settlement_value_protected_zar: int = 0
    systemic_stress_runs: int = 0
    recent_runs: list[dict] = []
    risk_distribution_by_run: list[dict] = []
    intervention_breakdown: dict = {}
    trend_data: list[dict] = []
