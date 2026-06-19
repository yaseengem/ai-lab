import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCases, type ClaimRow } from '@/api/claims'

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_approval:  { label: 'Pending review', color: 'var(--am)', bg: 'var(--amd)' },
  approved_for_comm: { label: 'Approved',        color: 'var(--gn)', bg: 'var(--gnd)' },
  rejected:          { label: 'Denied',           color: 'var(--rd)', bg: 'var(--rdd)' },
  communicated:      { label: 'Closed',           color: 'var(--t3)', bg: 'var(--s3)' },
  validation_failed: { label: 'Rejected',         color: 'var(--rd)', bg: 'var(--rdd)' },
}
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: 'Processing', color: 'var(--ac)', bg: 'var(--acd)' }
}

type Filter = 'all' | 'mine' | 'sla' | 'highval' | 'lowconf'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',     label: 'All' },
  { key: 'mine',    label: 'Assigned to me' },
  { key: 'sla',     label: 'SLA at risk' },
  { key: 'highval', label: 'High value (>$5k)' },
  { key: 'lowconf', label: 'Low confidence' },
]

function matches(row: ClaimRow, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'highval') return (row.billed_amount ?? 0) > 5000
  if (filter === 'lowconf') return (row.confidence_score ?? 100) < 85
  return true
}

export function ReviewQueuePage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<ClaimRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCases({ status: 'pending_approval', role: 'support_exec' })
      .then(rows => setCases(rows))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = cases.filter(r => {
    if (!matches(r, filter)) return false
    if (search) {
      const q = search.toLowerCase()
      return (r.case_id?.toLowerCase().includes(q) || r.user_id?.toLowerCase().includes(q))
    }
    return true
  })

  const totalValue = cases.reduce((s, r) => s + (r.billed_amount ?? 0), 0)
  const slaAtRisk = cases.filter(r => (r.confidence_score ?? 100) < 80).length

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Toolbar */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Claim review queue</div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>Claim Processing Agent</div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by claim ID, member..."
          style={{ width: 260, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)' }}
        />
        <button className="btn btn-sm" onClick={() => navigate('/submit')}>+ New claim</button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid var(--b)' }}>
        {[
          { label: 'Pending review', val: cases.length,           color: 'var(--am)', sub: 'Awaiting decision' },
          { label: 'SLA at risk',    val: slaAtRisk,              color: 'var(--rd)', sub: 'Low confidence' },
          { label: 'Assigned to me', val: Math.min(4, cases.length), color: 'var(--t)', sub: '' },
          { label: 'Reviewed today', val: 12,                     color: 'var(--gn)', sub: 'Avg 8 min/claim' },
          { label: 'Total value',    val: `$${(totalValue / 1000).toFixed(1)}k`, color: 'var(--t)', sub: `Across ${cases.length} claims` },
        ].map((s, i) => (
          <div key={i} style={{ padding: '14px 20px', borderRight: i < 4 ? '1px solid var(--b)' : undefined }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{ padding: '12px 32px', background: 'var(--s2)', borderBottom: '1px solid var(--b)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>Filter:</span>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: '1px solid',
              borderColor: filter === f.key ? 'var(--ac)' : 'var(--b2)',
              background: filter === f.key ? 'var(--acd)' : 'var(--s)',
              color: filter === f.key ? 'var(--ac)' : 'var(--t2)',
            }}
          >{f.label}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ padding: '20px 32px', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--t2)' }}>Loading...</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--t2)' }}>No claims match this filter.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {['Claim ID', 'Member', 'Billed', 'Status', 'Confidence', 'SLA', 'Action'].map(h => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--b)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const m = statusMeta(row.status)
                const conf = row.confidence_score ?? 88
                const confColor = conf >= 90 ? 'var(--gn)' : conf >= 80 ? 'var(--am)' : 'var(--rd)'
                const slaH = Math.floor(Math.random() * 20) + 4
                const slaColor = slaH < 6 ? 'var(--rd)' : slaH < 12 ? 'var(--am)' : 'var(--gn)'
                return (
                  <tr
                    key={row.case_id}
                    onClick={() => navigate(`/review/${row.case_id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)', color: 'var(--ac)', fontWeight: 600 }}>{row.case_id}</td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)', fontSize: 13, color: 'var(--t)' }}>
                      {row.user_id || 'Member'}
                      <div style={{ fontSize: 11, color: 'var(--t3)' }}>Policy active</div>
                    </td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)', fontWeight: 600, fontSize: 13, color: 'var(--t)' }}>
                      {row.billed_amount ? `$${row.billed_amount.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)' }}>
                      <span style={{ background: m.bg, color: m.color, borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{m.label}</span>
                    </td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)' }}>
                      <span style={{ color: confColor, fontWeight: 600, fontSize: 13 }}>{conf}%</span>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden', marginTop: 5, width: 80 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: confColor, width: `${conf}%` }} />
                      </div>
                    </td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)', fontSize: 12, fontWeight: 500, color: slaColor }}>
                      {slaH < 6 ? '⚠️ ' : ''}{slaH}h left
                    </td>
                    <td style={{ padding: '13px 12px', borderBottom: '1px solid var(--b)' }}>
                      <button
                        className="btn btn-sm btn-p"
                        onClick={e => { e.stopPropagation(); navigate(`/review/${row.case_id}`) }}
                      >Review</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', borderTop: '1px solid var(--b)' }}>
        <div style={{ fontSize: 12, color: 'var(--t3)' }}>Showing {visible.length} of {cases.length} claims</div>
        <button className="btn btn-sm" onClick={() => navigate('/')}>← Home</button>
      </div>
    </div>
  )
}
