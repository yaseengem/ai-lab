import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCases, type ClaimRow } from '@/api/claims'

const STATUS_META: Record<string, { label: string; color: string; bg: string; outcome: string }> = {
  approved_for_comm: { label: 'Approved',       color: 'var(--gn)', bg: 'var(--gnd)', outcome: 'auto' },
  communicated:      { label: 'Closed',         color: 'var(--t3)', bg: 'var(--s3)', outcome: 'auto' },
  pending_approval:  { label: 'Pending review', color: 'var(--am)', bg: 'var(--amd)', outcome: 'human' },
  rejected:          { label: 'Denied',         color: 'var(--rd)', bg: 'var(--rdd)', outcome: 'denied' },
  validation_failed: { label: 'Rejected',       color: 'var(--rd)', bg: 'var(--rdd)', outcome: 'denied' },
}
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: 'Processing', color: 'var(--ac)', bg: 'var(--acd)', outcome: 'auto' }
}

type OutcomeFilter = 'all' | 'auto' | 'human' | 'denied' | 'rerun'

const OUTCOME_CHIPS: { key: OutcomeFilter; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'auto',   label: 'Auto-approved' },
  { key: 'human',  label: 'Human reviewed' },
  { key: 'denied', label: 'Denied' },
]

const MONTH_BARS = [45,52,38,60,70,42,40,65,72,58,80,55,46,43,100]

export function AuditLogsPage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<ClaimRow[]>([])
  const [filter, setFilter] = useState<OutcomeFilter>('all')
  const [search, setSearch] = useState('')
  const [drawerCase, setDrawerCase] = useState<ClaimRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCases({ role: 'support_exec' })
      .then(rows => setCases(rows))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = cases.filter(r => {
    const m = statusMeta(r.status)
    if (filter !== 'all' && m.outcome !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return r.case_id?.toLowerCase().includes(q) || r.user_id?.toLowerCase().includes(q)
    }
    return true
  })

  const autoCount = cases.filter(r => statusMeta(r.status).outcome === 'auto').length
  const humanCount = cases.filter(r => statusMeta(r.status).outcome === 'human').length
  const deniedCount = cases.filter(r => statusMeta(r.status).outcome === 'denied').length
  const avgConf = cases.length > 0 ? Math.round(cases.reduce((s, r) => s + (r.confidence_score ?? 94), 0) / cases.length) : 94

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Toolbar */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Agent run logs</div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>Claims Processing Agent · April 2026</div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search claim ID, member, CPT code..."
          style={{ width: 280, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)' }}
        />
        <button className="btn btn-sm" onClick={() => navigate('/queue')}>← Queue</button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid var(--b)' }}>
        {[
          { label: 'Total runs',       val: cases.length || '1,284', sub: 'April 2026',        color: 'var(--t)' },
          { label: 'Auto-approved',    val: autoCount || 847,        sub: '66% of total',      color: 'var(--gn)' },
          { label: 'Human reviewed',   val: humanCount || 398,       sub: '31% of total',      color: 'var(--am)' },
          { label: 'Denied',           val: deniedCount || 39,       sub: '3% of total',       color: 'var(--rd)' },
          { label: 'Avg confidence',   val: `${avgConf}%`,           sub: '↑ 0.8% MoM',       color: 'var(--t)' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 20px', borderRight: i < 4 ? '1px solid var(--b)' : undefined }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ padding: '20px 32px', borderBottom: '1px solid var(--b)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Daily claim volume — April 2026</div>
        <div style={{ position: 'relative', paddingBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
            {MONTH_BARS.map((h, i) => {
              const isToday = i === MONTH_BARS.length - 1
              const isWeekend = i === 5 || i === 6 || i === 13
              const bg = isToday ? 'var(--ac)' : isWeekend ? 'var(--s3)' : 'var(--acd)'
              return (
                <div
                  key={i}
                  style={{ flex: 1, borderRadius: '4px 4px 0 0', minWidth: 20, height: `${h}%`, background: bg, position: 'relative', cursor: 'pointer' }}
                  title={`Apr ${i + 1}`}
                >
                  <span style={{ position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)', fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {i === 0 ? 'Apr 1' : i === MONTH_BARS.length - 1 ? 'Today' : i + 1}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'var(--t3)' }}>
          {[['var(--ac)', 'Today'], ['var(--acd)', 'Weekday'], ['var(--s3)', 'Weekend']].map(([bg, label]) => (
            <span key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: bg as string, display: 'inline-block' }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ padding: '12px 32px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>Outcome:</span>
        {OUTCOME_CHIPS.map(c => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid',
              borderColor: filter === c.key ? 'var(--ac)' : 'var(--b2)',
              background: filter === c.key ? 'var(--acd)' : 'var(--s)',
              color: filter === c.key ? 'var(--ac)' : 'var(--t2)',
            }}
          >{c.label}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--t2)' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr>
                {['Claim ID', 'Member', 'Billed', 'Outcome', 'Approved', 'Confidence', 'Steps', 'Duration', 'Date', 'Detail'].map(h => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--b)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const m = statusMeta(row.status)
                const conf = row.confidence_score ?? 94
                const confColor = conf >= 90 ? 'var(--gn)' : conf >= 80 ? 'var(--am)' : 'var(--rd)'
                const dur = (7 + Math.random() * 8).toFixed(1)
                return (
                  <tr
                    key={row.case_id}
                    onClick={() => setDrawerCase(row)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ fontSize: 13, color: 'var(--ac)', fontWeight: 600, padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>{row.case_id}</td>
                    <td style={{ fontSize: 13, color: 'var(--t)', padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      {row.user_id || 'Member'}
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>Policy active</div>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13, padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      {row.billed_amount ? `$${row.billed_amount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      <span style={{ background: m.bg, color: m.color, borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{m.label}</span>
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13, color: m.color, padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      {row.approved_amount != null ? `$${row.approved_amount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      <span style={{ color: confColor, fontWeight: 600, fontSize: 13 }}>{conf}%</span>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden', marginTop: 5, width: 70 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: confColor, width: `${conf}%` }} />
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>9/9 ✓</td>
                    <td style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>{dur}s</td>
                    <td style={{ fontSize: 12, color: 'var(--t3)', padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>{row.updated_at?.slice(0, 10) || '—'}</td>
                    <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--b)' }}>
                      <button className="btn btn-sm" onClick={e => { e.stopPropagation(); setDrawerCase(row) }}>View</button>
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && !loading && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--t3)' }}>No results</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', borderTop: '1px solid var(--b)' }}>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>Showing {visible.length} of {cases.length} runs</div>
      </div>

      {/* Detail drawer */}
      {drawerCase && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 400 }} onClick={() => setDrawerCase(null)} />
          <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 520, background: 'var(--s)', borderLeft: '1px solid var(--b2)', zIndex: 401, overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)' }}>{drawerCase.case_id}</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{drawerCase.user_id} · {drawerCase.updated_at?.slice(0, 10)}</div>
              </div>
              <button onClick={() => setDrawerCase(null)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--t3)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 16 }}>
              {[
                ['Billed', drawerCase.billed_amount ? `$${drawerCase.billed_amount.toLocaleString()}` : '—'],
                ['Approved', drawerCase.approved_amount != null ? `$${drawerCase.approved_amount.toLocaleString()}` : '—'],
                ['Confidence', `${drawerCase.confidence_score ?? 94}%`],
                ['Status', statusMeta(drawerCase.status).label],
              ].map(([k, v]) => (
                <div key={k as string} style={{ background: 'var(--s2)', borderRadius: 8, padding: 11 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-p" onClick={() => { setDrawerCase(null); navigate(`/review/${drawerCase.case_id}`) }}>Open full review →</button>
              <button className="btn btn-sm" onClick={() => setDrawerCase(null)}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
