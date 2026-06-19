import { useEffect, useState } from 'react'
import { API } from '../config'
import { useRun } from '../context/RunContext'
import { formatDateTime } from '../lib/datetime'
import type { SummaryData } from '../types'

function RiskBar({ critical, high, medium, low, total }: {
  critical: number; high: number; medium: number; low: number; total: number
}) {
  if (total === 0) return <div style={{ height: 10, background: 'var(--s2)', borderRadius: 5 }} />
  return (
    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1 }}>
      {[
        { count: critical, color: 'var(--rd)' }, { count: high, color: 'var(--am)' },
        { count: medium, color: 'var(--ac)' }, { count: low, color: 'var(--gn)' },
      ].map((s, i) => s.count > 0 ? (
        <div key={i} style={{ flex: s.count / total, background: s.color, minWidth: 4 }} />
      ) : null)}
    </div>
  )
}

export function AuditReportPage() {
  const { eventLog, doneSummary, steps, riskItems, interventionItems, sessionId } = useRun()
  const [summary, setSummary] = useState<SummaryData | null>(null)

  useEffect(() => {
    fetch(`${API}/summary`).then(r => r.json()).then(setSummary).catch(() => null)
  }, [])

  const criticals = riskItems.filter(r => r.classification === 'CRITICAL').length
  const highs = riskItems.filter(r => r.classification === 'HIGH').length
  const mediums = riskItems.filter(r => r.classification === 'MEDIUM').length
  const lows = riskItems.filter(r => r.classification === 'LOW').length
  const totalRisk = criticals + highs + mediums + lows

  const auditEvents = eventLog.filter(e =>
    ['tool-call', 'tool-result', 'risk-item', 'counterparty-brief',
      'intervention-item', 'lolr-execution', 'roll-execution',
      'systemic-risk-alert', 'approval-decision'].includes(e.type)
  )

  const runId = (doneSummary?.run_id as string) || (sessionId ? `JSE-SFPP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${sessionId.slice(0, 4)}` : null)

  const handleDownload = () => {
    const rows = [
      ['Timestamp', 'Type', 'Agent Step', 'Trade ID', 'Counterparty', 'Detail'],
      ...auditEvents.map(e => [
        new Date().toISOString(),
        e.type,
        String(e.step || ''),
        String(e.trade_id || ''),
        String(e.counterparty_id || ''),
        JSON.stringify(e).slice(0, 200),
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${runId || 'audit-report'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const EVENT_LABELS: Record<string, string> = {
    'tool-call': 'Tool Called', 'tool-result': 'Tool Result', 'risk-item': 'Risk Classified',
    'counterparty-brief': 'Counterparty Analysed', 'intervention-item': 'Intervention Decided',
    'lolr-execution': 'LOLR Executed', 'roll-execution': 'Roll Executed',
    'systemic-risk-alert': 'Systemic Risk Alert', 'approval-decision': 'Approval Decision',
  }
  const EVENT_COLORS: Record<string, string> = {
    'tool-call': 'var(--ac)', 'tool-result': 'var(--gn)', 'risk-item': 'var(--rd)',
    'counterparty-brief': 'var(--am)', 'intervention-item': 'var(--pu)', 'lolr-execution': 'var(--rd)',
    'roll-execution': 'var(--am)', 'systemic-risk-alert': 'var(--rd)', 'approval-decision': 'var(--gn)',
  }

  const allStepsComplete = steps.every(s => s.status === 'complete' || s.status === 'skipped')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>FSCA Compliance & Audit Report</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>Regulatory audit trail — FSCA examination ready</p>
        </div>
        {auditEvents.length > 0 && (
          <button className="btn btn-sm" onClick={handleDownload}>⬇ Download CSV</button>
        )}
      </div>

      {/* Run metadata */}
      {runId ? (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Run Metadata</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>RUN ID</div>
              <div style={{ fontSize: 12, color: 'var(--t)', fontFamily: 'monospace' }}>{runId}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>SESSION</div>
              <div style={{ fontSize: 12, color: 'var(--t)', fontFamily: 'monospace' }}>{sessionId?.slice(0, 12)}…</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>STATUS</div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                color: allStepsComplete ? 'var(--gn)' : 'var(--am)',
                background: allStepsComplete ? 'var(--gnd)' : 'var(--amd)',
              }}>
                {allStepsComplete ? 'SUCCESS' : 'IN PROGRESS'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>TRADES MONITORED</div>
              <div style={{ fontSize: 12, color: 'var(--t)' }}>{riskItems.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>INTERVENTIONS DECIDED</div>
              <div style={{ fontSize: 12, color: 'var(--t)' }}>{interventionItems.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>DATA SOURCES</div>
              <div style={{ fontSize: 12, color: 'var(--t)' }}>ECS, CIS, TIS</div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
          padding: 40, textAlign: 'center', marginBottom: 20,
        }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>No run data available</div>
          <div style={{ fontSize: 13, color: 'var(--t2)' }}>Complete a pipeline run to generate the audit report.</div>
        </div>
      )}

      {/* Risk summary */}
      {totalRisk > 0 && (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Risk Assessment Summary</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {[
              { label: 'CRITICAL', count: criticals, color: 'var(--rd)' },
              { label: 'HIGH', count: highs, color: 'var(--am)' },
              { label: 'MEDIUM', count: mediums, color: 'var(--ac)' },
              { label: 'LOW', count: lows, color: 'var(--gn)' },
            ].map(t => (
              <div key={t.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{t.count}</div>
                <div style={{ fontSize: 11, color: 'var(--t2)' }}>{t.label}</div>
              </div>
            ))}
          </div>
          <RiskBar critical={criticals} high={highs} medium={mediums} low={lows} total={totalRisk} />
        </div>
      )}

      {/* Interventions taken */}
      {interventionItems.length > 0 && (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Interventions Taken</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Trade ID', 'Counterparty', 'Intervention', 'Rationale', 'Est. Cost', 'Human Approval'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {interventionItems.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t)' }}>{item.trade_id}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t)' }}>{item.counterparty_name || item.counterparty_id}</td>
                  <td style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: 'var(--t2)' }}>
                    {item.intervention_type.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t2)', maxWidth: 280 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.rationale || '—'}
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t)' }}>
                    {item.estimated_cost_zar ? `ZAR ${(item.estimated_cost_zar / 1e6).toFixed(1)}M` : '—'}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    {item.requires_human_approval
                      ? <span style={{ color: 'var(--am)', fontSize: 11 }}>Required</span>
                      : <span style={{ color: 'var(--gn)', fontSize: 11 }}>Auto</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent decision audit trail */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Agent Decision Audit Trail</h3>
          <span style={{ fontSize: 12, color: 'var(--t2)' }}>{auditEvents.length} entries</span>
        </div>
        {auditEvents.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            No audit events yet. Complete a pipeline run to generate the audit trail.
          </div>
        ) : (
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--s2)', zIndex: 1 }}>
                <tr>
                  {['Step', 'Event Type', 'Trade ID', 'Counterparty', 'Detail'].map(h => (
                    <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((ev, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                    <td style={{ padding: '7px 12px', color: 'var(--t2)' }}>
                      {ev.step ? `Step ${ev.step}` : '—'}
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                        color: EVENT_COLORS[ev.type] || 'var(--t2)',
                        background: `${EVENT_COLORS[ev.type] || 'var(--t2)'}20`,
                      }}>
                        {EVENT_LABELS[ev.type] || ev.type}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px', color: 'var(--t)', fontWeight: 500 }}>
                      {String(ev.trade_id || '—')}
                    </td>
                    <td style={{ padding: '7px 12px', color: 'var(--t2)' }}>
                      {String(ev.counterparty_id || ev.counterparty_name || '—')}
                    </td>
                    <td style={{ padding: '7px 12px', color: 'var(--t2)', maxWidth: 320 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.type === 'tool-call' && `Called ${ev.tool}`}
                        {ev.type === 'tool-result' && `${ev.tool}: ${ev.preview || ''}`}
                        {ev.type === 'risk-item' && `${ev.classification} — ${ev.rationale || ''}`}
                        {ev.type === 'counterparty-brief' && `${ev.root_cause} / ${ev.urgency}`}
                        {ev.type === 'intervention-item' && `${ev.intervention_type}${ev.requires_human_approval ? ' (needs approval)' : ''}`}
                        {ev.type === 'systemic-risk-alert' && String(ev.message || 'Systemic risk triggered')}
                        {ev.type === 'approval-decision' && `${ev.decision} — ${ev.approver_id || 'ops-user'}`}
                        {!['tool-call', 'tool-result', 'risk-item', 'counterparty-brief', 'intervention-item', 'systemic-risk-alert', 'approval-decision'].includes(ev.type) && JSON.stringify(ev).slice(0, 100)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System health attestation */}
      {(steps.length > 0 && steps.some(s => s.status !== 'waiting')) && (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20, marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>System Health Attestation</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {steps.map(s => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{
                  fontSize: 10,
                  color: s.status === 'complete' ? 'var(--gn)' : s.status === 'failed' ? 'var(--rd)' : s.status === 'skipped' ? 'var(--t3)' : 'var(--am)',
                }}>●</span>
                <span style={{ color: 'var(--t)' }}>Step {s.step}: {s.agent}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: s.status === 'complete' ? 'var(--gn)' : s.status === 'failed' ? 'var(--rd)' : 'var(--t3)',
                }}>{s.status.toUpperCase()}</span>
                {s.elapsed && <span style={{ color: 'var(--t3)', marginLeft: 'auto' }}>{s.elapsed.toFixed(1)}s</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent runs from summary */}
      {summary && summary.recent_runs.length > 0 && (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden', marginTop: 20 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Historical Runs</h3>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Run ID', 'Timestamp', 'Status', 'CRITICAL', 'Interventions'].map(h => (
                  <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.recent_runs.slice(0, 10).map((run, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                  <td style={{ padding: '9px 14px', color: 'var(--t)', fontFamily: 'monospace', fontSize: 11 }}>
                    {run.run_id || '—'}
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>
                    {formatDateTime(run.created_at)}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      color: run.execution_status === 'SUCCESS' ? 'var(--gn)' : 'var(--rd)',
                      background: run.execution_status === 'SUCCESS' ? 'var(--gnd)' : 'var(--rdd)',
                    }}>{run.execution_status || run.status}</span>
                  </td>
                  <td style={{ padding: '9px 14px', color: run.critical_count > 0 ? 'var(--rd)' : 'var(--t2)', fontWeight: run.critical_count > 0 ? 700 : 400 }}>
                    {run.critical_count}
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{run.interventions_executed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
