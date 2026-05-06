import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useRun } from '../context/RunContext'

const RISK_COLORS: Record<string, string> = {
  CRITICAL: 'var(--rd)', HIGH: 'var(--am)', MEDIUM: 'var(--ac)', LOW: 'var(--gn)',
}
const RISK_BG: Record<string, string> = {
  CRITICAL: 'var(--rdd)', HIGH: 'var(--amd)', MEDIUM: 'var(--acd)', LOW: 'var(--gnd)',
}
const INT_COLORS: Record<string, string> = {
  LOLR_TRIGGER: 'var(--rd)', SETTLEMENT_ROLL: 'var(--am)',
  ALERT_OPERATIONS: 'var(--ac)', HUMAN_ESCALATION: 'var(--pu)', MONITOR_ONLY: 'var(--t3)',
}

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

type SortKey = 'classification' | 'net_obligation_zar' | 'trade_id' | 'counterparty_name'
const RISK_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export function WatchlistPage() {
  const { riskItems, interventionItems } = useRun()
  const navigate = useNavigate()

  const [filterTiers, setFilterTiers] = useState<Set<string>>(new Set())
  const [filterWindow, setFilterWindow] = useState<'all' | 'T+1' | 'T+2'>('all')
  const [filterIntType, setFilterIntType] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('classification')
  const [sortAsc, setSortAsc] = useState(true)

  const intMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const item of interventionItems) m[item.trade_id] = item.intervention_type
    return m
  }, [interventionItems])

  const filtered = useMemo(() => {
    let items = riskItems.map(r => ({ ...r, intervention: intMap[r.trade_id] || '—' }))

    if (filterTiers.size > 0) items = items.filter(r => filterTiers.has(r.classification))
    if (filterWindow !== 'all') items = items.filter(r => r.settlement_window === filterWindow)
    if (filterIntType !== 'all') items = items.filter(r => r.intervention === filterIntType)
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(r =>
        r.trade_id.toLowerCase().includes(q) ||
        r.counterparty_name?.toLowerCase().includes(q) ||
        r.counterparty_id.toLowerCase().includes(q) ||
        r.isin?.toLowerCase().includes(q)
      )
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'classification') {
        cmp = (RISK_ORDER[a.classification as keyof typeof RISK_ORDER] ?? 4) - (RISK_ORDER[b.classification as keyof typeof RISK_ORDER] ?? 4)
      } else if (sortKey === 'net_obligation_zar') {
        cmp = b.net_obligation_zar - a.net_obligation_zar
      } else if (sortKey === 'trade_id') {
        cmp = a.trade_id.localeCompare(b.trade_id)
      } else if (sortKey === 'counterparty_name') {
        cmp = (a.counterparty_name || '').localeCompare(b.counterparty_name || '')
      }
      return sortAsc ? cmp : -cmp
    })

    return items
  }, [riskItems, interventionItems, filterTiers, filterWindow, filterIntType, search, sortKey, sortAsc, intMap])

  const toggleTier = (tier: string) => {
    setFilterTiers(prev => {
      const next = new Set(prev)
      next.has(tier) ? next.delete(tier) : next.add(tier)
      return next
    })
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <th
      onClick={() => toggleSort(k)}
      style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  )

  const intTypes = [...new Set(Object.values(intMap))].filter(Boolean)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Settlement Watchlist</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>T+1 and T+2 trades — current monitoring cycle</p>
        </div>
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>{filtered.length} of {riskItems.length} trades</span>
      </div>

      {/* Filter bar */}
      <div style={{
        background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
        padding: '14px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* Risk tier chips */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>RISK</span>
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(tier => (
            <button
              key={tier}
              onClick={() => toggleTier(tier)}
              style={{
                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${RISK_COLORS[tier]}`,
                background: filterTiers.has(tier) ? RISK_COLORS[tier] : 'transparent',
                color: filterTiers.has(tier) ? '#fff' : RISK_COLORS[tier],
              }}
            >{tier}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--b)' }} />

        {/* Settlement window */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>WINDOW</span>
          {(['all', 'T+1', 'T+2'] as const).map(w => (
            <button key={w} onClick={() => setFilterWindow(w)}
              className={filterWindow === w ? 'btn btn-p btn-sm' : 'btn btn-sm'}
              style={{ fontSize: 11 }}>
              {w === 'all' ? 'All' : w}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--b)' }} />

        {/* Intervention type */}
        {intTypes.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>ACTION</span>
            <select
              value={filterIntType}
              onChange={e => setFilterIntType(e.target.value)}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 6,
                border: '1px solid var(--b)', background: 'var(--s)', color: 'var(--t)',
              }}
            >
              <option value="all">All</option>
              {intTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="Search trade, counterparty, ISIN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px', borderRadius: 7, border: '1px solid var(--b)',
              fontSize: 12, width: 240, background: 'var(--s)', color: 'var(--t)',
            }}
          />
        </div>
      </div>

      {/* Table */}
      {riskItems.length === 0 ? (
        <div style={{
          background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
          padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>No trades in watchlist</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
            Start a pipeline run to populate the settlement watchlist.
          </div>
          <Link to="/monitor"><button className="btn btn-p">▶ Go to Pipeline Monitor</button></Link>
        </div>
      ) : (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                <SortHeader label="Trade ID" k="trade_id" />
                <SortHeader label="Counterparty" k="counterparty_name" />
                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>ISIN</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Window</th>
                <SortHeader label="Value (ZAR)" k="net_obligation_zar" />
                <SortHeader label="Risk" k="classification" />
                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Rule Triggers</th>
                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Intervention</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => (
                <tr
                  key={i}
                  style={{ borderTop: '1px solid var(--b)', background: 'var(--s)', cursor: 'pointer' }}
                  onClick={() => navigate(`/watchlist/${encodeURIComponent(item.trade_id)}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--s)')}
                >
                  <td style={{ padding: '10px 14px', color: 'var(--t)', fontWeight: 600 }}>{item.trade_id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t)' }}>{item.counterparty_name || item.counterparty_id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>{item.isin || '—'}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.settlement_window ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: item.settlement_window === 'T+1' ? 'var(--rdd)' : 'var(--amd)',
                        color: item.settlement_window === 'T+1' ? 'var(--rd)' : 'var(--am)',
                      }}>{item.settlement_window}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t)', fontWeight: 500 }}>
                    {item.net_obligation_zar > 0 ? fmt(item.net_obligation_zar) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      color: RISK_COLORS[item.classification], background: RISK_BG[item.classification],
                    }}>{item.classification}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(item.rule_triggers || []).slice(0, 2).map((t, j) => (
                        <span key={j} style={{ fontSize: 10, color: 'var(--t2)', background: 'var(--s2)', padding: '1px 5px', borderRadius: 3 }}>{t}</span>
                      ))}
                      {(item.rule_triggers || []).length > 2 && (
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>+{item.rule_triggers.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.intervention !== '—' ? (
                      <span style={{ fontSize: 11, fontWeight: 600, color: INT_COLORS[item.intervention] || 'var(--t2)' }}>
                        {item.intervention.replace(/_/g, ' ')}
                      </span>
                    ) : <span style={{ color: 'var(--t3)' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
              No trades match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
