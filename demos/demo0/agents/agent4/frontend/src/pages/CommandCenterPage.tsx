import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API } from '../config'
import { useRun } from '../context/RunContext'
import { formatDateTime } from '../lib/datetime'
import type { SummaryData } from '../types'

function fmt_m(n: number) { return `ZAR ${(n / 1_000_000).toFixed(0)}M` }

function BigTile({ label, value, color, sub, to }: {
  label: string; value: string | number; color: string; sub?: string; to?: string
}) {
  const inner = (
    <div style={{
      background: 'var(--s)', border: `1.5px solid ${color}20`, borderRadius: 12,
      padding: '20px 24px', flex: 1, minWidth: 140,
      cursor: to ? 'pointer' : 'default',
      transition: 'border-color 0.15s, transform 0.05s',
    }}
    onMouseEnter={(e) => { if (to) e.currentTarget.style.borderColor = color }}
    onMouseLeave={(e) => { if (to) e.currentTarget.style.borderColor = `${color}20` }}
    >
      <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  if (!to) return inner
  return <Link to={to} style={{ flex: 1, minWidth: 140, textDecoration: 'none' }}>{inner}</Link>
}

function SystemHealthChip({ label, status }: { label: string; status: 'ok' | 'degraded' | 'unavailable' }) {
  const colors = { ok: 'var(--gn)', degraded: 'var(--am)', unavailable: 'var(--rd)' }
  const bgs = { ok: 'var(--gnd)', degraded: 'var(--amd)', unavailable: 'var(--rdd)' }
  const icons = { ok: '●', degraded: '◐', unavailable: '○' }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
      background: bgs[status], borderRadius: 20, fontSize: 12,
    }}>
      <span style={{ color: colors[status], fontSize: 10 }}>{icons[status]}</span>
      <span style={{ fontWeight: 600, color: colors[status] }}>{label}</span>
      <span style={{ color: colors[status], fontSize: 11 }}>{status.toUpperCase()}</span>
    </div>
  )
}

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
        <div key={i} style={{ flex: s.count / total, background: s.color, minWidth: 4 }} title={`${s.count}`} />
      ) : null)}
    </div>
  )
}

export function CommandCenterPage() {
  const ctx = useRun()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/summary`)
      .then(r => r.json())
      .then(d => { setSummary(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const criticals = ctx.riskItems.filter(r => r.classification === 'CRITICAL').length
  const highs = ctx.riskItems.filter(r => r.classification === 'HIGH').length
  const mediums = ctx.riskItems.filter(r => r.classification === 'MEDIUM').length
  const lows = ctx.riskItems.filter(r => r.classification === 'LOW').length
  const totalRisk = criticals + highs + mediums + lows

  const ecsOk = !ctx.dataQualityFlags.some(f => f.includes('ECS'))
  const cisOk = !ctx.dataQualityFlags.some(f => f.includes('CIS_UNAVAILABLE'))
  const cisDegraded = ctx.dataQualityFlags.some(f => f.includes('CIS_DEGRADED') || f.includes('DEGRADED'))
  const tisOk = !ctx.dataQualityFlags.some(f => f.includes('TIS'))

  const completedSteps = ctx.steps.filter(s => s.status === 'complete').length
  const lolrCount = ctx.lolrItems.filter(l => l.status === 'Confirmed').length
  const rollCount = ctx.rollItems.filter(r => r.status === 'Confirmed' || r.status === 'Submitted').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Systemic risk banner */}
      {ctx.systemicRisk && (
        <div style={{
          background: 'var(--rdd)', border: '2px solid var(--rd)', borderRadius: 10,
          padding: '14px 20px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🚨</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--rd)' }}>Systemic Risk Flag Active</div>
            <div style={{ fontSize: 13, color: 'var(--rd)' }}>
              Multiple CRITICAL counterparties detected simultaneously. Auto-execution suspended — all items escalated to human review.
            </div>
          </div>
          <Link to="/escalations" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-sm" style={{ color: 'var(--rd)', borderColor: 'var(--rd)', fontWeight: 700 }}>
              Review Escalations →
            </button>
          </Link>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Operations Command Center</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>JSE Settlement Failure Prevention — Live Status</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {ctx.running && (
            <span style={{ fontSize: 13, color: 'var(--ac)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10 }}>●</span> Pipeline running — Step {ctx.steps.filter(s => s.status === 'complete').length + 1} of 7
            </span>
          )}
          {ctx.done && (
            <span style={{ fontSize: 13, color: 'var(--gn)', fontWeight: 600 }}>✓ Last run complete</span>
          )}
          <Link to="/monitor"><button className="btn btn-p btn-sm">▶ New Run</button></Link>
        </div>
      </div>

      {/* Live risk tiles — each tile drills through to the relevant filtered page */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <BigTile label="CRITICAL" value={criticals} color="var(--rd)" sub="Immediate action" to="/watchlist?classification=CRITICAL" />
        <BigTile label="HIGH" value={highs} color="var(--am)" sub="Action before T+2" to="/watchlist?classification=HIGH" />
        <BigTile label="MEDIUM" value={mediums} color="var(--ac)" sub="Monitor closely" to="/watchlist?classification=MEDIUM" />
        <BigTile label="LOW" value={lows} color="var(--gn)" sub="No action required" to="/watchlist?classification=LOW" />
        {summary && (
          <BigTile
            label="Value Protected"
            value={summary.total_settlement_value_protected_zar > 0 ? fmt_m(summary.total_settlement_value_protected_zar) : '—'}
            color="var(--tl)"
            sub="All time ZAR"
            to="/runs"
          />
        )}
      </div>

      {/* Middle row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Pipeline progress */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Pipeline Progress</h3>
          {ctx.running || ctx.done ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ctx.steps.map(s => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: s.status === 'complete' ? 'var(--gn)' : s.status === 'running' ? 'var(--ac)' : s.status === 'failed' ? 'var(--rd)' : 'var(--s3)',
                  }} />
                  <span style={{ fontSize: 12, color: s.status === 'waiting' ? 'var(--t3)' : 'var(--t)', flex: 1 }}>
                    Step {s.step}
                  </span>
                  {s.elapsed && <span style={{ fontSize: 11, color: 'var(--t3)' }}>{s.elapsed.toFixed(1)}s</span>}
                </div>
              ))}
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t2)' }}>
                {completedSteps} / 7 steps complete
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', padding: 20 }}>
              No active run.<br />
              <Link to="/monitor" style={{ color: 'var(--ac)' }}>Start a pipeline →</Link>
            </div>
          )}
        </div>

        {/* Active interventions */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Active Interventions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>LOLR Executed</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: lolrCount > 0 ? 'var(--rd)' : 'var(--t3)' }}>{lolrCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>Settlement Rolls</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: rollCount > 0 ? 'var(--am)' : 'var(--t3)' }}>{rollCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>Pending Approvals</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: ctx.pendingApprovals.length > 0 ? 'var(--am)' : 'var(--t3)' }}>
                {ctx.pendingApprovals.length}
              </span>
            </div>
            {ctx.pendingApprovals.length > 0 && (
              <Link to="/escalations">
                <button className="btn btn-sm" style={{ width: '100%', marginTop: 4, color: 'var(--am)', borderColor: 'var(--am)' }}>
                  Review Pending Approvals →
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* System health */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>System Health</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SystemHealthChip label="ECS" status={ecsOk ? 'ok' : 'unavailable'} />
            <SystemHealthChip label="CIS" status={!cisOk ? 'unavailable' : cisDegraded ? 'degraded' : 'ok'} />
            <SystemHealthChip label="TIS" status={tisOk ? 'ok' : 'unavailable'} />
          </div>
          {ctx.dataQualityFlags.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--am)' }}>
              ⚠️ {ctx.dataQualityFlags.length} data quality flag{ctx.dataQualityFlags.length > 1 ? 's' : ''} active
            </div>
          )}
        </div>
      </div>

      {/* Risk distribution bar (if run active) */}
      {totalRisk > 0 && (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Current Run Risk Distribution</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { color: 'var(--rd)', label: 'CRITICAL', count: criticals },
                { color: 'var(--am)', label: 'HIGH', count: highs },
                { color: 'var(--ac)', label: 'MEDIUM', count: mediums },
                { color: 'var(--gn)', label: 'LOW', count: lows },
              ].map(l => l.count > 0 ? (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, background: l.color, borderRadius: 2 }} />
                  <span style={{ fontSize: 11, color: 'var(--t2)' }}>{l.count} {l.label}</span>
                </div>
              ) : null)}
            </div>
          </div>
          <RiskBar critical={criticals} high={highs} medium={mediums} low={lows} total={totalRisk} />
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <Link to="/watchlist" style={{ fontSize: 12, color: 'var(--ac)' }}>View Full Watchlist →</Link>
          </div>
        </div>
      )}

      {/* Recent runs table */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Recent Pipeline Runs</h3>
          <button className="btn btn-sm" onClick={() => {
            setLoading(true)
            fetch(`${API}/summary`).then(r => r.json()).then(d => { setSummary(d); setLoading(false) }).catch(() => setLoading(false))
          }}>↻ Refresh</button>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>Loading…</div>
        ) : !summary || summary.recent_runs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            No runs yet — <Link to="/monitor" style={{ color: 'var(--ac)' }}>trigger a pipeline</Link>.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Run ID', 'Timestamp', 'Mode', 'Status', 'CRITICAL', 'Interventions', 'Stress'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.recent_runs.map((run, i) => (
                <tr
                  key={i}
                  onClick={() => navigate(`/runs/${run.session_id}`)}
                  style={{
                    borderTop: '1px solid var(--b)',
                    background: run.systemic_stress ? 'var(--rdd)' : 'var(--s)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = run.systemic_stress ? 'var(--rdd)' : 'var(--s2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = run.systemic_stress ? 'var(--rdd)' : 'var(--s)')}
                >
                  <td style={{ padding: '10px 16px', color: 'var(--t)', fontWeight: 500 }}>
                    {run.run_id ? run.run_id.slice(0, 22) : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>
                    {formatDateTime(run.created_at)}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{run.trigger_mode}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      color: run.execution_status === 'SUCCESS' ? 'var(--gn)' : run.execution_status === 'FAILED' ? 'var(--rd)' : 'var(--t2)',
                      background: run.execution_status === 'SUCCESS' ? 'var(--gnd)' : run.execution_status === 'FAILED' ? 'var(--rdd)' : 'var(--s2)',
                    }}>
                      {run.execution_status || run.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: run.critical_count > 0 ? 'var(--rd)' : 'var(--t2)', fontWeight: run.critical_count > 0 ? 700 : 400 }}>
                    {run.critical_count}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{run.interventions_executed}</td>
                  <td style={{ padding: '10px 16px' }}>
                    {run.systemic_stress
                      ? <span style={{ color: 'var(--rd)', fontWeight: 700, fontSize: 11 }}>🚨 YES</span>
                      : <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
