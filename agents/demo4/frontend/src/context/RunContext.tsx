import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { API } from '../config'
import type {
  StepStatus, StepState, RiskItem, CounterpartyBrief, InterventionItem,
  LolrItem, RollItem, ApprovalItem, ApprovalDecision, SseEvent, Alert,
} from '../types'

const SESSION_STORAGE_KEY = 'nexus-sfp-session'

const STEP_LABELS: Record<number, string> = {
  1: 'Data Ingestion', 2: 'Risk Scoring', 3: 'Counterparty Risk',
  4: 'Intervention Decision', 5: 'LOLR Execution', 6: 'Settlement Roll', 7: 'Reporting & Audit',
}

function initSteps(): StepState[] {
  return Array.from({ length: 7 }, (_, i) => ({
    step: i + 1, agent: STEP_LABELS[i + 1], status: 'waiting' as StepStatus,
  }))
}

interface RunContextValue {
  sessionId: string | null
  running: boolean
  done: boolean
  steps: StepState[]
  riskItems: RiskItem[]
  counterpartyBriefs: CounterpartyBrief[]
  interventionItems: InterventionItem[]
  lolrItems: LolrItem[]
  lolrTotalZar: number
  rollItems: RollItem[]
  pendingApprovals: ApprovalItem[]
  approvalHistory: ApprovalDecision[]
  systemicRisk: boolean
  dataQualityFlags: string[]
  doneSummary: Record<string, unknown> | null
  eventLog: SseEvent[]
  alerts: Alert[]

  setSessionId: (id: string) => void
  setRunning: (v: boolean) => void
  handleEvent: (ev: SseEvent) => void
  reset: () => void
  approve: (itemId: string) => Promise<void>
  reject: (itemId: string) => Promise<void>
  acknowledgeAlert: (id: string) => void
}

const RunContext = createContext<RunContextValue | null>(null)

export function RunContextProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionIdState] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [steps, setSteps] = useState<StepState[]>(initSteps)
  const [riskItems, setRiskItems] = useState<RiskItem[]>([])
  const [counterpartyBriefs, setCounterpartyBriefs] = useState<CounterpartyBrief[]>([])
  const [interventionItems, setInterventionItems] = useState<InterventionItem[]>([])
  const [lolrItems, setLolrItems] = useState<LolrItem[]>([])
  const [lolrTotalZar, setLolrTotalZar] = useState(0)
  const [rollItems, setRollItems] = useState<RollItem[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalItem[]>([])
  const [approvalHistory, setApprovalHistory] = useState<ApprovalDecision[]>([])
  const [systemicRisk, setSystemicRisk] = useState(false)
  const [dataQualityFlags, setDataQualityFlags] = useState<string[]>([])
  const [doneSummary, setDoneSummary] = useState<Record<string, unknown> | null>(null)
  const [eventLog, setEventLog] = useState<SseEvent[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  const stepTimers = useRef<Record<number, number>>({})
  const sessionIdRef = useRef<string | null>(null)

  const setSessionId = (id: string) => {
    setSessionIdState(id)
    sessionIdRef.current = id
  }

  // On mount: restore the last completed session from localStorage so monitoring
  // pages have data even after a page refresh.
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!stored) return
    fetch(`${API}/pipeline/${stored}/events`)
      .then(r => r.json())
      .then(data => {
        const events: SseEvent[] = data.events || []
        if (!events.length) return

        setSessionIdState(stored)
        sessionIdRef.current = stored

        const newSteps = initSteps()
        const newRiskItems: RiskItem[] = []
        const newCounterpartyBriefs: CounterpartyBrief[] = []
        const newInterventionItems: InterventionItem[] = []
        const newLolrItems: LolrItem[] = []
        let newLolrTotalZar = 0
        const newRollItems: RollItem[] = []
        const newPendingApprovals: ApprovalItem[] = []
        const newApprovalHistory: ApprovalDecision[] = []
        let newSystemicRisk = false
        const newDataQualityFlags: string[] = []
        let newDoneSummary: Record<string, unknown> | null = null
        let isDone = false

        for (const ev of events) {
          switch (ev.type) {
            case 'pipeline-step': {
              const idx = newSteps.findIndex(s => s.step === (ev.step as number))
              if (idx >= 0) newSteps[idx] = {
                ...newSteps[idx],
                status: ev.status as StepStatus,
                outputSummary: (ev.output_summary as string) || newSteps[idx].outputSummary,
              }
              break
            }
            case 'risk-item':
              newRiskItems.push(ev as unknown as RiskItem)
              break
            case 'counterparty-brief':
              newCounterpartyBriefs.push({
                counterparty_id: ev.counterparty_id as string,
                counterparty_name: ev.counterparty_name as string | undefined,
                root_cause: ev.root_cause as string,
                urgency: ev.urgency as string,
                severity_assessment: ev.severity_assessment as string | undefined,
                securities_at_risk: ev.securities_at_risk as Array<{ isin: string; shortfall_qty: number }> | undefined,
                recommended_intervention: (ev.recommended_intervention || ev.recommended) as string | undefined,
                cis_status: ev.cis_status as string | undefined,
                lending_balance_pct: ev.lending_balance_pct as number | undefined,
                last_failure_date: ev.last_failure_date as string | undefined,
                watchlist_status: ev.watchlist_status as boolean | undefined,
              })
              break
            case 'intervention-item': {
              const item: InterventionItem = {
                trade_id: ev.trade_id as string,
                counterparty_id: ev.counterparty_id as string,
                counterparty_name: ev.counterparty_name as string | undefined,
                intervention_type: ev.intervention_type as InterventionItem['intervention_type'],
                rationale: ev.rationale as string | undefined,
                estimated_cost_zar: ev.estimated_cost_zar as number | undefined,
                execution_priority: ev.execution_priority as number | undefined,
                requires_human_approval: ev.requires_human_approval as boolean | undefined,
              }
              newInterventionItems.push(item)
              if (item.intervention_type === 'LOLR_TRIGGER' && !newLolrItems.some(l => l.item_id === item.trade_id)) {
                newLolrItems.push({
                  item_id: item.trade_id, trade_id: item.trade_id,
                  counterparty_id: item.counterparty_id,
                  isin: ev.isin as string || '—',
                  value_zar: item.estimated_cost_zar || 0,
                  status: item.requires_human_approval ? 'Awaiting Approval' : 'Pending',
                  timestamp: new Date().toISOString(),
                })
              }
              if (item.intervention_type === 'SETTLEMENT_ROLL' && !newRollItems.some(r => r.trade_id === item.trade_id)) {
                newRollItems.push({
                  trade_id: item.trade_id, counterparty_id: item.counterparty_id,
                  status: 'Submitted', timestamp: new Date().toISOString(),
                })
              }
              break
            }
            case 'lolr-execution': {
              const lolr: LolrItem = {
                item_id: ev.transaction_id as string || ev.trade_id as string,
                trade_id: ev.trade_id as string,
                counterparty_id: ev.counterparty_id as string,
                isin: ev.security_id as string || ev.isin as string || '—',
                direction: ev.direction as 'LEND' | 'BORROW' | undefined,
                value_zar: ev.estimated_cost_zar as number || 0,
                status: ev.status as LolrItem['status'] || 'Pending',
                confirmation_id: ev.confirmation_id as string | undefined,
                timestamp: ev.execution_timestamp as string || new Date().toISOString(),
                regulatory_basis: ev.regulatory_basis as string | undefined,
              }
              const idx = newLolrItems.findIndex(l => l.item_id === lolr.item_id)
              if (idx >= 0) newLolrItems[idx] = lolr
              else newLolrItems.push(lolr)
              if (lolr.status === 'Confirmed') newLolrTotalZar += lolr.value_zar
              break
            }
            case 'roll-execution': {
              const roll: RollItem = {
                trade_id: ev.trade_id as string,
                counterparty_id: ev.counterparty_id as string,
                original_settlement_date: ev.original_settlement_date as string | undefined,
                new_settlement_date: ev.new_settlement_date as string | undefined,
                reason_code: ev.reason_code as string | undefined,
                strate_confirmation_ref: ev.strate_confirmation_ref as string | undefined,
                counterparty_notified: ev.counterparty_notified as boolean | undefined,
                status: ev.status as RollItem['status'] || 'Submitted',
                timestamp: ev.timestamp as string || new Date().toISOString(),
              }
              const idx = newRollItems.findIndex(r => r.trade_id === roll.trade_id)
              if (idx >= 0) newRollItems[idx] = roll
              else newRollItems.push(roll)
              break
            }
            case 'human-approval-required':
              if (!newPendingApprovals.some(a => a.item_id === (ev.item_id as string))) {
                newPendingApprovals.push({
                  item_id: ev.item_id as string, trade_id: ev.trade_id as string,
                  counterparty_id: ev.counterparty_id as string,
                  isin: ev.isin as string, value_zar: ev.value_zar as number,
                  rationale: ev.rationale as string, timestamp: Date.now(),
                })
              }
              break
            case 'approval-decision': {
              const itemId = ev.item_id as string
              const decision = ev.decision as 'approved' | 'rejected'
              const pIdx = newPendingApprovals.findIndex(a => a.item_id === itemId)
              if (pIdx >= 0) newPendingApprovals.splice(pIdx, 1)
              newApprovalHistory.push({
                item_id: itemId, trade_id: ev.trade_id as string || itemId,
                decision, approver_id: ev.approver_id as string || 'ops-user', timestamp: Date.now(),
              })
              if (decision === 'approved') {
                const lIdx = newLolrItems.findIndex(l => l.item_id === itemId)
                if (lIdx >= 0) {
                  newLolrTotalZar += newLolrItems[lIdx].value_zar
                  newLolrItems[lIdx] = { ...newLolrItems[lIdx], status: 'Confirmed' }
                }
              }
              break
            }
            case 'systemic-risk-alert':
              newSystemicRisk = true
              break
            case 'data-quality-flag': {
              const flag = ev.flag as string || String(ev.message || '')
              if (flag && !newDataQualityFlags.includes(flag)) newDataQualityFlags.push(flag)
              break
            }
            case 'done':
              isDone = true
              newDoneSummary = ev.summary as Record<string, unknown>
              break
          }
        }

        setSteps(newSteps)
        setRiskItems(newRiskItems)
        setCounterpartyBriefs(newCounterpartyBriefs)
        setInterventionItems(newInterventionItems)
        setLolrItems(newLolrItems)
        setLolrTotalZar(newLolrTotalZar)
        setRollItems(newRollItems)
        setPendingApprovals(newPendingApprovals)
        setApprovalHistory(newApprovalHistory)
        setSystemicRisk(newSystemicRisk)
        setDataQualityFlags(newDataQualityFlags)
        setEventLog(events)
        if (isDone) { setDone(true); setDoneSummary(newDoneSummary) }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setSessionIdState(null)
    sessionIdRef.current = null
    setRunning(false)
    setDone(false)
    setSteps(initSteps())
    setRiskItems([])
    setCounterpartyBriefs([])
    setInterventionItems([])
    setLolrItems([])
    setLolrTotalZar(0)
    setRollItems([])
    setPendingApprovals([])
    setDoneSummary(null)
    setEventLog([])
    setSystemicRisk(false)
    setDataQualityFlags([])
    stepTimers.current = {}
  }

  const handleEvent = useCallback((ev: SseEvent) => {
    setEventLog(prev => [...prev, ev])

    switch (ev.type) {
      case 'pipeline-step': {
        const s = ev.step as number
        const status = ev.status as StepStatus
        if (status === 'running') stepTimers.current[s] = Date.now()
        const elapsed = stepTimers.current[s]
          ? (Date.now() - stepTimers.current[s]) / 1000
          : undefined
        setSteps(prev => prev.map(step =>
          step.step === s ? {
            ...step, status,
            outputSummary: (ev.output_summary as string) || step.outputSummary,
            elapsed: ['complete', 'failed', 'skipped'].includes(status) ? elapsed : step.elapsed,
          } : step
        ))
        if (status === 'failed') {
          setAlerts(prev => [...prev, {
            id: `alert-step-${s}-${Date.now()}`, severity: 'HIGH',
            message: `Step ${s} (${STEP_LABELS[s]}) failed`,
            source_step: s, session_id: sessionIdRef.current ?? undefined,
            timestamp: Date.now(), acknowledged: false,
          }])
        }
        break
      }
      case 'risk-item':
        setRiskItems(prev => [...prev, ev as unknown as RiskItem])
        break

      case 'counterparty-brief':
        setCounterpartyBriefs(prev => [...prev, {
          counterparty_id: ev.counterparty_id as string,
          counterparty_name: ev.counterparty_name as string | undefined,
          root_cause: ev.root_cause as string,
          urgency: ev.urgency as string,
          severity_assessment: ev.severity_assessment as string | undefined,
          securities_at_risk: ev.securities_at_risk as Array<{ isin: string; shortfall_qty: number }> | undefined,
          recommended_intervention: (ev.recommended_intervention || ev.recommended) as string | undefined,
          cis_status: ev.cis_status as string | undefined,
          lending_balance_pct: ev.lending_balance_pct as number | undefined,
          last_failure_date: ev.last_failure_date as string | undefined,
          watchlist_status: ev.watchlist_status as boolean | undefined,
        }])
        break

      case 'intervention-item': {
        const item: InterventionItem = {
          trade_id: ev.trade_id as string,
          counterparty_id: ev.counterparty_id as string,
          counterparty_name: ev.counterparty_name as string | undefined,
          intervention_type: ev.intervention_type as InterventionItem['intervention_type'],
          rationale: ev.rationale as string | undefined,
          estimated_cost_zar: ev.estimated_cost_zar as number | undefined,
          execution_priority: ev.execution_priority as number | undefined,
          requires_human_approval: ev.requires_human_approval as boolean | undefined,
        }
        setInterventionItems(prev => [...prev, item])
        if (item.intervention_type === 'LOLR_TRIGGER') {
          const lolr: LolrItem = {
            item_id: item.trade_id,
            trade_id: item.trade_id,
            counterparty_id: item.counterparty_id,
            isin: ev.isin as string || '—',
            value_zar: item.estimated_cost_zar || 0,
            status: item.requires_human_approval ? 'Awaiting Approval' : 'Pending',
            timestamp: new Date().toISOString(),
          }
          setLolrItems(prev => {
            if (prev.some(l => l.item_id === lolr.item_id)) return prev
            return [...prev, lolr]
          })
        }
        if (item.intervention_type === 'SETTLEMENT_ROLL') {
          setRollItems(prev => {
            if (prev.some(r => r.trade_id === item.trade_id)) return prev
            return [...prev, {
              trade_id: item.trade_id,
              counterparty_id: item.counterparty_id,
              status: 'Submitted',
              timestamp: new Date().toISOString(),
            }]
          })
        }
        break
      }

      case 'lolr-execution': {
        const lolr: LolrItem = {
          item_id: ev.transaction_id as string || ev.trade_id as string,
          trade_id: ev.trade_id as string,
          counterparty_id: ev.counterparty_id as string,
          isin: ev.security_id as string || ev.isin as string || '—',
          direction: ev.direction as 'LEND' | 'BORROW' | undefined,
          value_zar: ev.estimated_cost_zar as number || 0,
          status: ev.status as LolrItem['status'] || 'Pending',
          confirmation_id: ev.confirmation_id as string | undefined,
          timestamp: ev.execution_timestamp as string || new Date().toISOString(),
          regulatory_basis: ev.regulatory_basis as string | undefined,
        }
        setLolrItems(prev => {
          const idx = prev.findIndex(l => l.item_id === lolr.item_id)
          return idx >= 0 ? prev.map((l, i) => i === idx ? lolr : l) : [...prev, lolr]
        })
        if (lolr.status === 'Confirmed') setLolrTotalZar(prev => prev + lolr.value_zar)
        break
      }

      case 'roll-execution': {
        const roll: RollItem = {
          trade_id: ev.trade_id as string,
          counterparty_id: ev.counterparty_id as string,
          original_settlement_date: ev.original_settlement_date as string | undefined,
          new_settlement_date: ev.new_settlement_date as string | undefined,
          reason_code: ev.reason_code as string | undefined,
          strate_confirmation_ref: ev.strate_confirmation_ref as string | undefined,
          counterparty_notified: ev.counterparty_notified as boolean | undefined,
          status: ev.status as RollItem['status'] || 'Submitted',
          timestamp: ev.timestamp as string || new Date().toISOString(),
        }
        setRollItems(prev => {
          const idx = prev.findIndex(r => r.trade_id === roll.trade_id)
          return idx >= 0 ? prev.map((r, i) => i === idx ? roll : r) : [...prev, roll]
        })
        break
      }

      case 'human-approval-required':
        setPendingApprovals(prev => [...prev, {
          item_id: ev.item_id as string,
          trade_id: ev.trade_id as string,
          counterparty_id: ev.counterparty_id as string,
          isin: ev.isin as string,
          value_zar: ev.value_zar as number,
          rationale: ev.rationale as string,
          timestamp: Date.now(),
        }])
        setLolrItems(prev => prev.map(l =>
          l.trade_id === (ev.trade_id as string) ? { ...l, status: 'Awaiting Approval' } : l
        ))
        break

      case 'approval-decision': {
        const itemId = ev.item_id as string
        const decision = ev.decision as 'approved' | 'rejected'
        setPendingApprovals(prev => prev.filter(a => a.item_id !== itemId))
        setApprovalHistory(prev => [...prev, {
          item_id: itemId,
          trade_id: ev.trade_id as string || itemId,
          decision,
          approver_id: ev.approver_id as string || 'ops-user',
          timestamp: Date.now(),
        }])
        if (decision === 'approved') {
          setLolrItems(prev => prev.map(l =>
            l.item_id === itemId ? { ...l, status: 'Confirmed' } : l
          ))
          setLolrTotalZar(prev => {
            const item = lolrItems.find(l => l.item_id === itemId)
            return prev + (item?.value_zar || 0)
          })
        }
        break
      }

      case 'systemic-risk-alert':
        setSystemicRisk(true)
        setAlerts(prev => [...prev, {
          id: `alert-sys-${Date.now()}`, severity: 'HIGH',
          message: ev.message as string || 'Systemic risk flag triggered — all CRITICAL items escalated to human review',
          source_step: ev.step as number | undefined,
          session_id: sessionIdRef.current ?? undefined,
          timestamp: Date.now(), acknowledged: false,
        }])
        break

      case 'lolr-guard-triggered':
        setAlerts(prev => [...prev, {
          id: `alert-guard-${Date.now()}`, severity: 'HIGH',
          message: ev.message as string || 'LOLR ZAR 500M auto-execution guard triggered — human approval required',
          source_step: 5, session_id: sessionIdRef.current ?? undefined,
          timestamp: Date.now(), acknowledged: false,
        }])
        break

      case 'data-quality-flag':
        setDataQualityFlags(prev => {
          const flag = ev.flag as string || String(ev.message || '')
          return prev.includes(flag) ? prev : [...prev, flag]
        })
        break

      case 'done':
        setDone(true)
        setRunning(false)
        setDoneSummary(ev.summary as Record<string, unknown>)
        break

      case 'error':
        setRunning(false)
        setAlerts(prev => [...prev, {
          id: `alert-err-${Date.now()}`, severity: 'HIGH',
          message: `Pipeline error: ${ev.message as string || 'Unknown error'}`,
          source_step: ev.step as number | undefined,
          session_id: sessionIdRef.current ?? undefined,
          timestamp: Date.now(), acknowledged: false,
        }])
        break
    }
  }, [lolrItems])

  const approve = async (itemId: string) => {
    if (!sessionIdRef.current) return
    await fetch(`${API}/approve/${sessionIdRef.current}/${itemId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', approver_id: 'ops-user' }),
    })
  }

  const reject = async (itemId: string) => {
    if (!sessionIdRef.current) return
    await fetch(`${API}/reject/${sessionIdRef.current}/${itemId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'reject', approver_id: 'ops-user' }),
    })
  }

  const acknowledgeAlert = (id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a))
  }

  return (
    <RunContext.Provider value={{
      sessionId, running, done, steps, riskItems, counterpartyBriefs,
      interventionItems, lolrItems, lolrTotalZar, rollItems, pendingApprovals,
      approvalHistory, systemicRisk, dataQualityFlags, doneSummary, eventLog, alerts,
      setSessionId, setRunning, handleEvent, reset, approve, reject, acknowledgeAlert,
    }}>
      {children}
    </RunContext.Provider>
  )
}

export function useRun() {
  const ctx = useContext(RunContext)
  if (!ctx) throw new Error('useRun must be used inside RunContextProvider')
  return ctx
}
