import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../config'
import { formatDateTime, formatDuration } from '../lib/datetime'

interface RunDetail {
  meta: {
    session_id: string
    run_id?: string
    status: string
    execution_status?: string | null
    trigger_mode?: string
    created_at?: string
    completed_at?: string | null
    event_count?: number
    critical_count?: number
    high_count?: number
    medium_count?: number
    low_count?: number
    interventions_executed?: number
    systemic_stress?: boolean
    error?: string
    llm_run_id_hint?: string
  }
  state: {
    status?: string
    steps?: Array<{ step: number; agent_name: string; status: string; output_summary?: string }>
    pending_approvals?: Array<{ item_id: string; trade_id?: string; counterparty_id?: string; value_zar?: number; rationale?: string }>
    intervention_plan?: { items?: Array<Record<string, unknown>> }
    fsca_report?: Record<string, unknown>
  }
  events: Array<{ id?: number; ts?: string; type: string; [k: string]: unknown }>
  event_count: number
}

const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  queued: { fg: 'var(--t2)', bg: 'var(--s2)' },
  running: { fg: 'var(--ac)', bg: 'var(--acd)' },
  awaiting_approval: { fg: 'var(--am)', bg: 'var(--amd)' },
  complete: { fg: 'var(--gn)', bg: 'var(--gnd)' },
  failed: { fg: 'var(--rd)', bg: 'var(--rdd)' },
  interrupted: { fg: 'var(--rd)', bg: 'var(--rdd)' },
  cancelled: { fg: 'var(--t3)', bg: 'var(--s2)' },
}

function StatusChip({ status }: { status: string }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.queued
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
      color: c.fg, background: c.bg, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{status}</span>
  )
}

function StepRow({ s }: { s: { step: number; agent_name: string; status: string; output_summary?: string } }) {
  const colors: Record<string, string> = {
    waiting: 'var(--t3)', running: 'var(--ac)', complete: 'var(--gn)',
    skipped: 'var(--t3)', failed: 'var(--rd)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--b)' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors[s.status] || 'var(--s3)' }} />
      <div style={{ width: 24, fontSize: 11, fontWeight: 700, color: 'var(--t3)' }}>{s.step}</div>
      <div style={{ flex: 1, fontSize: 13, color: s.status === 'waiting' ? 'var(--t3)' : 'var(--t)' }}>{s.agent_name}</div>
      <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase' }}>{s.status}</div>
      {s.output_summary && (
        <div style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.output_summary}
        </div>
      )}
    </div>
  )
}

const NON_TERMINAL = new Set(['queued', 'running', 'awaiting_approval'])

export function RunDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const esRef = useRef<EventSource | null>(null)
  const [liveEvents, setLiveEvents] = useState<Array<{ id?: number; ts?: string; type: string; [k: string]: unknown }>>([])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setError(null)
    fetch(`${API}/runs/${sessionId}/detail`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: RunDetail) => setDetail(d))
      .catch((e: Error) => setError(e.message))
  }, [sessionId, refreshKey])

  // Auto-refresh every 5s while non-terminal
  useEffect(() => {
    if (!detail || !NON_TERMINAL.has(detail.meta.status)) return
    const id = setInterval(() => setRefreshKey(k => k + 1), 5000)
    return () => clearInterval(id)
  }, [detail])

  // Live SSE attach for non-terminal runs. EventSource handles Last-Event-ID
  // automatically on reconnect — the backend replays history past that cursor.
  useEffect(() => {
    if (!sessionId || !detail) return
    if (!NON_TERMINAL.has(detail.meta.status)) return
    if (esRef.current) return  // already attached for this run
    const es = new EventSource(`${API}/monitor/${sessionId}`)
    esRef.current = es
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        if (ev.type === 'heartbeat') return
        setLiveEvents(prev => [...prev, ev])
        if (ev.type === 'done' || ev.type === 'error' || ev.type === 'already-complete') {
          es.close()
          esRef.current = null
          setRefreshKey(k => k + 1)
        }
        // status-change events also warrant a meta refetch so the chip flips
        if (ev.type === 'status-change' || ev.type === 'run-interrupted') {
          setRefreshKey(k => k + 1)
        }
      } catch {/* ignore */}
    }
    es.onerror = () => {
      // EventSource will auto-reconnect; nothing to do.
    }
    return () => { es.close(); esRef.current = null }
  }, [sessionId, detail?.meta.status])  // eslint-disable-line react-hooks/exhaustive-deps

  const decide = async (itemId: string, decision: 'approve' | 'reject') => {
    if (!sessionId) return
    setBusy(itemId)
    try {
      await fetch(`${API}/${decision}/${sessionId}/${itemId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, approver_id: 'ops-user' }),
      })
      setRefreshKey(k => k + 1)
    } finally {
      setBusy(null)
    }
  }

  if (!sessionId) return <div style={{ padding: 32 }}>Missing session id.</div>
  if (error) return (
    <div style={{ padding: 32 }}>
      <p style={{ color: 'var(--rd)' }}>Error: {error}</p>
      <Link to="/runs" style={{ color: 'var(--ac)' }}>← Back to Runs</Link>
    </div>
  )
  if (!detail) return <div style={{ padding: 32, color: 'var(--t3)' }}>Loading…</div>

  const { meta, state, events } = detail
  const allEvents = [...events, ...liveEvents].sort((a, b) => (a.id || 0) - (b.id || 0))
  const isLive = NON_TERMINAL.has(meta.status)
  const pendingApprovals = state.pending_approvals || []

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 4 }}>
        <Link to="/runs" style={{ fontSize: 12, color: 'var(--ac)', textDecoration: 'none' }}>← Back to Runs</Link>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)', marginBottom: 6, fontFamily: 'monospace' }}>
            {meta.run_id || meta.session_id.slice(0, 12)}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <StatusChip status={meta.status} />
            {meta.execution_status && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{meta.execution_status}</span>
            )}
            <span style={{ fontSize: 12, color: 'var(--t2)' }}>
              Started {formatDateTime(meta.created_at)} · Duration {formatDuration(meta.created_at, isLive ? undefined : meta.completed_at)}
            </span>
            {isLive && <span style={{ fontSize: 11, color: 'var(--ac)' }}>● Live</span>}
          </div>
        </div>
        <button className="btn btn-sm" onClick={() => setRefreshKey(k => k + 1)}>↻ Refresh</button>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'CRITICAL', value: meta.critical_count ?? 0, color: 'var(--rd)' },
          { label: 'HIGH', value: meta.high_count ?? 0, color: 'var(--am)' },
          { label: 'MEDIUM', value: meta.medium_count ?? 0, color: 'var(--ac)' },
          { label: 'LOW', value: meta.low_count ?? 0, color: 'var(--gn)' },
          { label: 'Interventions', value: meta.interventions_executed ?? 0, color: 'var(--tl)' },
        ].map(t => (
          <div key={t.label} style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.color }}>{t.value}</div>
            <div style={{ fontSize: 11, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t.label}</div>
          </div>
        ))}
      </div>

      {meta.status === 'interrupted' && (
        <div style={{
          background: 'var(--rdd)', border: '1px solid var(--rd)', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--rd)',
        }}>
          ⚠ This run was interrupted before completion (likely a process restart). It will not resume — start a new run if needed.
        </div>
      )}

      {/* Pending approvals — actionable */}
      {pendingApprovals.length > 0 && (
        <div style={{ background: 'var(--amd)', border: '1px solid var(--am)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--am)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Awaiting human approval — {pendingApprovals.length} item{pendingApprovals.length === 1 ? '' : 's'}
          </h3>
          {pendingApprovals.map(a => (
            <div key={a.item_id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 0', borderTop: '1px solid var(--am)50',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                  {a.trade_id} → {a.counterparty_id}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  {a.rationale || '—'} · ZAR {(a.value_zar || 0).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-sm"
                  disabled={busy === a.item_id}
                  onClick={() => decide(a.item_id, 'reject')}
                  style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}
                >Reject</button>
                <button
                  className="btn btn-p btn-sm"
                  disabled={busy === a.item_id}
                  onClick={() => decide(a.item_id, 'approve')}
                >Approve</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Pipeline steps */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Pipeline Steps</h3>
          {(state.steps || []).map(s => <StepRow key={s.step} s={s} />)}
        </div>

        {/* Run metadata */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Run Info</h3>
          <table style={{ fontSize: 12, width: '100%' }}>
            <tbody>
              {[
                ['Session ID', meta.session_id],
                ['Run ID', meta.run_id || '—'],
                ['Trigger', meta.trigger_mode || '—'],
                ['Created', formatDateTime(meta.created_at)],
                ['Completed', formatDateTime(meta.completed_at)],
                ['Event count', String(meta.event_count ?? 0)],
                ['Systemic stress', meta.systemic_stress ? 'YES' : 'no'],
                ['LLM run_id (hint)', meta.llm_run_id_hint || '—'],
                ['Error', meta.error || '—'],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '4px 8px 4px 0', color: 'var(--t2)' }}>{k}</td>
                  <td style={{ padding: '4px 0', color: 'var(--t)', fontFamily: 'monospace', fontSize: 11 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event timeline */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>
          Event Timeline ({allEvents.length} of {detail.event_count})
        </h3>
        <div style={{ maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 }}>
          {allEvents.map((ev, i) => (
            <div key={`${ev.id ?? 'live'}-${i}`} style={{
              display: 'flex', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--b)',
            }}>
              <span style={{ color: 'var(--t3)', minWidth: 36 }}>#{ev.id ?? '—'}</span>
              <span style={{ color: 'var(--t3)', minWidth: 144 }}>{formatDateTime(ev.ts)}</span>
              <span style={{ color: 'var(--ac)', minWidth: 160 }}>{ev.type}</span>
              <span style={{ color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {Object.entries(ev).filter(([k]) => !['id', 'ts', 'type'].includes(k))
                  .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ').slice(0, 200)}
              </span>
            </div>
          ))}
          {allEvents.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--t3)' }}>No events yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
