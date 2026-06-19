import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { API } from '../config'
import { formatDateTime, formatDuration } from '../lib/datetime'

const ALL_STATUSES = ['queued', 'running', 'awaiting_approval', 'complete', 'failed', 'interrupted', 'cancelled'] as const
const ALL_TRIGGERS = ['api', 'upload', 'test'] as const

interface RunRow {
  session_id: string
  run_id?: string | null
  status: string
  execution_status?: string | null
  trigger_mode?: string
  created_at?: string
  completed_at?: string | null
  critical_count?: number
  high_count?: number
  interventions_executed?: number
  systemic_stress?: boolean
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
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      color: c.fg, background: c.bg, textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>{status}</span>
  )
}

function MultiSelectChips({ options, value, onChange }: {
  options: readonly string[]; value: string[]; onChange: (v: string[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const active = value.includes(opt)
        return (
          <button
            key={opt}
            onClick={() => onChange(active ? value.filter(v => v !== opt) : [...value, opt])}
            style={{
              fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 12,
              border: `1px solid ${active ? 'var(--ac)' : 'var(--b2)'}`,
              background: active ? 'var(--acd)' : 'var(--s)',
              color: active ? 'var(--ac)' : 'var(--t2)', cursor: 'pointer',
            }}
          >{opt}</button>
        )
      })}
    </div>
  )
}

export function RunsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => ({
    status: (params.get('status') || '').split(',').filter(Boolean),
    trigger_mode: (params.get('trigger_mode') || '').split(',').filter(Boolean),
    run_id_contains: params.get('run_id_contains') || '',
    started_after: params.get('started_after') || '',
    started_before: params.get('started_before') || '',
    has_systemic_stress: params.get('has_systemic_stress'),
    sort: params.get('sort') || 'created_at:desc',
  }), [params])

  const [rows, setRows] = useState<RunRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const qs = new URLSearchParams()
    if (filters.status.length) qs.set('status', filters.status.join(','))
    if (filters.trigger_mode.length) qs.set('trigger_mode', filters.trigger_mode.join(','))
    if (filters.run_id_contains) qs.set('run_id_contains', filters.run_id_contains)
    if (filters.started_after) qs.set('started_after', filters.started_after)
    if (filters.started_before) qs.set('started_before', filters.started_before)
    if (filters.has_systemic_stress) qs.set('has_systemic_stress', filters.has_systemic_stress)
    qs.set('sort', filters.sort)
    qs.set('limit', '100')

    setLoading(true)
    fetch(`${API}/runs?${qs.toString()}`)
      .then(r => r.json())
      .then(d => { setRows(d.runs || []); setTotal(d.total || 0); setLoading(false) })
      .catch(() => setLoading(false))
  }, [filters, refreshKey])

  // Auto-refresh every 5s while any visible row is non-terminal.
  useEffect(() => {
    const NON_TERMINAL = new Set(['queued', 'running', 'awaiting_approval'])
    const hasActive = rows.some(r => NON_TERMINAL.has(r.status))
    if (!hasActive) return
    const id = setInterval(() => setRefreshKey(k => k + 1), 5000)
    return () => clearInterval(id)
  }, [rows])

  const update = (patch: Partial<typeof filters>) => {
    const next = new URLSearchParams(params)
    const apply = (k: string, v: string | string[] | null | undefined) => {
      if (!v || (Array.isArray(v) && !v.length)) next.delete(k)
      else next.set(k, Array.isArray(v) ? v.join(',') : v)
    }
    if ('status' in patch) apply('status', patch.status!)
    if ('trigger_mode' in patch) apply('trigger_mode', patch.trigger_mode!)
    if ('run_id_contains' in patch) apply('run_id_contains', patch.run_id_contains!)
    if ('started_after' in patch) apply('started_after', patch.started_after!)
    if ('started_before' in patch) apply('started_before', patch.started_before!)
    if ('has_systemic_stress' in patch) apply('has_systemic_stress', patch.has_systemic_stress!)
    if ('sort' in patch) apply('sort', patch.sort!)
    setParams(next)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Runs</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>
            {total} run{total === 1 ? '' : 's'} matching filters. URL is shareable.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setRefreshKey(k => k + 1)}>↻ Refresh</button>
          <Link to="/monitor"><button className="btn btn-p btn-sm">▶ New Run</button></Link>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
        padding: 16, marginBottom: 16, display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
          <MultiSelectChips options={ALL_STATUSES} value={filters.status} onChange={v => update({ status: v })} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trigger mode</div>
          <MultiSelectChips options={ALL_TRIGGERS} value={filters.trigger_mode} onChange={v => update({ trigger_mode: v })} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Run ID contains</div>
          <input
            type="text" placeholder="RUN-2026..." value={filters.run_id_contains}
            onChange={(e) => update({ run_id_contains: e.target.value })}
            style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--b2)', borderRadius: 6 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started after</div>
            <input
              type="datetime-local" value={filters.started_after.slice(0, 16)}
              onChange={(e) => update({ started_after: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--b2)', borderRadius: 6 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started before</div>
            <input
              type="datetime-local" value={filters.started_before.slice(0, 16)}
              onChange={(e) => update({ started_before: e.target.value ? new Date(e.target.value).toISOString() : '' })}
              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid var(--b2)', borderRadius: 6 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <label style={{ fontSize: 12, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox" checked={filters.has_systemic_stress === 'true'}
              onChange={(e) => update({ has_systemic_stress: e.target.checked ? 'true' : '' })}
            />
            Systemic stress only
          </label>
          <div style={{ flex: 1 }} />
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value })}
            style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--b2)', borderRadius: 6 }}
          >
            <option value="created_at:desc">Newest first</option>
            <option value="created_at:asc">Oldest first</option>
            <option value="critical_count:desc">Most CRITICAL first</option>
            <option value="run_id:asc">Run ID A→Z</option>
          </select>
          <button
            className="btn btn-sm"
            onClick={() => setParams(new URLSearchParams())}
            style={{ color: 'var(--t2)' }}
          >Clear</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            No runs match these filters. <Link to="/monitor" style={{ color: 'var(--ac)' }}>Trigger a pipeline →</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Run ID', 'Status', 'Started', 'Duration', 'Trigger', 'CRITICAL', 'Interventions', 'Systemic', ''].map(h => (
                  <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isTerminal = !['queued', 'running', 'awaiting_approval'].includes(r.status)
                return (
                  <tr
                    key={r.session_id}
                    onClick={() => navigate(`/runs/${r.session_id}`)}
                    style={{
                      borderTop: '1px solid var(--b)', cursor: 'pointer',
                      background: r.systemic_stress ? 'var(--rdd)' : 'var(--s)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = r.systemic_stress ? 'var(--rdd)' : 'var(--s2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = r.systemic_stress ? 'var(--rdd)' : 'var(--s)')}
                  >
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: 'var(--t)' }}>
                      {r.run_id || <span style={{ color: 'var(--t3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}><StatusChip status={r.status} /></td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{formatDateTime(r.created_at)}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>
                      {formatDuration(r.created_at, isTerminal ? r.completed_at : undefined)}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{r.trigger_mode || '—'}</td>
                    <td style={{
                      padding: '10px 16px',
                      color: (r.critical_count || 0) > 0 ? 'var(--rd)' : 'var(--t2)',
                      fontWeight: (r.critical_count || 0) > 0 ? 700 : 400,
                    }}>{r.critical_count ?? 0}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)' }}>{r.interventions_executed ?? 0}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {r.systemic_stress
                        ? <span style={{ color: 'var(--rd)', fontWeight: 700, fontSize: 11 }}>🚨 YES</span>
                        : <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--ac)', fontSize: 11 }}>Detail →</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
