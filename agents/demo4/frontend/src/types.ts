export type StepStatus = 'waiting' | 'running' | 'complete' | 'skipped' | 'failed'

export interface StepState {
  step: number
  agent: string
  status: StepStatus
  outputSummary?: string
  startedAt?: number
  elapsed?: number
}

export interface RiskItem {
  trade_id: string
  counterparty_id: string
  counterparty_name: string
  classification: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  net_obligation_zar: number
  rationale: string
  rule_triggers: string[]
  settlement_window?: string
  isin?: string
  instrument?: string
  quantity?: number
}

export interface CounterpartyBrief {
  counterparty_id: string
  counterparty_name?: string
  root_cause: string
  urgency: string
  severity_assessment?: string
  securities_at_risk?: Array<{ isin: string; shortfall_qty: number }>
  recommended_intervention?: string
  cis_status?: string
  lending_balance_pct?: number
  last_failure_date?: string
  watchlist_status?: boolean
}

export interface InterventionItem {
  trade_id: string
  counterparty_id: string
  counterparty_name?: string
  intervention_type: 'LOLR_TRIGGER' | 'SETTLEMENT_ROLL' | 'ALERT_OPERATIONS' | 'HUMAN_ESCALATION' | 'MONITOR_ONLY'
  rationale?: string
  estimated_cost_zar?: number
  execution_priority?: number
  requires_human_approval?: boolean
}

export interface LolrItem {
  item_id: string
  trade_id: string
  counterparty_id: string
  isin: string
  direction?: 'LEND' | 'BORROW'
  value_zar: number
  status: 'Pending' | 'Confirmed' | 'Failed' | 'Awaiting Approval'
  confirmation_id?: string
  timestamp?: string
  regulatory_basis?: string
  retry_count?: number
}

export interface RollItem {
  trade_id: string
  counterparty_id: string
  original_settlement_date?: string
  new_settlement_date?: string
  reason_code?: string
  strate_confirmation_ref?: string
  counterparty_notified?: boolean
  status: 'Submitted' | 'Confirmed' | 'Failed' | 'Ineligible'
  timestamp?: string
  ineligible_reason?: string
}

export interface ApprovalItem {
  item_id: string
  trade_id: string
  counterparty_id: string
  isin: string
  value_zar: number
  rationale: string
  timestamp?: number
}

export interface ApprovalDecision {
  item_id: string
  trade_id: string
  decision: 'approved' | 'rejected'
  approver_id: string
  timestamp: number
  comment?: string
}

export interface SseEvent {
  type: string
  [key: string]: unknown
}

export interface Alert {
  id: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
  source_step?: number
  session_id?: string
  timestamp: number
  acknowledged: boolean
}

export interface RunRecord {
  session_id: string
  run_id?: string
  created_at: string
  trigger_mode: string
  status: string
  execution_status?: string
  critical_count: number
  interventions_executed: number
  systemic_stress: boolean
}

export interface SummaryData {
  total_runs: number
  completed_runs: number
  total_trades_monitored: number
  avg_critical_per_run: number
  total_lolr_executed: number
  total_rolls_executed: number
  total_alerts_sent: number
  total_human_escalations: number
  total_settlement_value_protected_zar: number
  systemic_stress_runs: number
  recent_runs: RunRecord[]
  risk_distribution_by_run: Array<{
    session_id: string
    run_id: string
    created_at: string
    critical: number
    high: number
    medium: number
    low: number
    trigger_mode: string
  }>
  intervention_breakdown: Record<string, number>
  trend_data: Array<{ date: string; critical_count: number }>
}
