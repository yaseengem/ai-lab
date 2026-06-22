import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRun } from '../context/RunContext'

const RISK_COLORS: Record<string, string> = {
  CRITICAL: 'var(--rd)', HIGH: 'var(--am)', MEDIUM: 'var(--ac)', LOW: 'var(--gn)',
}
const RISK_BG: Record<string, string> = {
  CRITICAL: 'var(--rdd)', HIGH: 'var(--amd)', MEDIUM: 'var(--acd)', LOW: 'var(--gnd)',
}
const RISK_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const ROOT_CAUSE_COLORS: Record<string, string> = {
  LIQUIDITY: 'var(--rd)', SECURITIES_SHORTFALL: 'var(--am)',
  CIS_CONNECTIVITY: 'var(--ac)', REGULATORY_FLAG: 'var(--pu)',
  MARKET_STRESS: 'var(--co)', UNKNOWN: 'var(--t3)',
}

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

export function CounterpartyProfilesPage() {
  const { riskItems, counterpartyBriefs } = useRun()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

  const counterparties = useMemo(() => {
    const map: Record<string, {
      id: string
      name: string
      trades: typeof riskItems
      maxRisk: string
      maxObligation: number
      brief: typeof counterpartyBriefs[0] | undefined
    }> = {}

    for (const item of riskItems) {
      if (!map[item.counterparty_id]) {
        map[item.counterparty_id] = {
          id: item.counterparty_id,
          name: item.counterparty_name || item.counterparty_id,
          trades: [],
          maxRisk: item.classification,
          maxObligation: 0,
          brief: counterpartyBriefs.find(b => b.counterparty_id === item.counterparty_id),
        }
      }
      const cp = map[item.counterparty_id]
      cp.trades.push(item)
      if ((RISK_ORDER[item.classification as keyof typeof RISK_ORDER] ?? 4) < (RISK_ORDER[cp.maxRisk as keyof typeof RISK_ORDER] ?? 4)) {
        cp.maxRisk = item.classification
      }
      cp.maxObligation = Math.max(cp.maxObligation, item.net_obligation_zar)
    }

    let result = Object.values(map)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(cp =>
        cp.id.toLowerCase().includes(q) || cp.name.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) =>
      (RISK_ORDER[a.maxRisk as keyof typeof RISK_ORDER] ?? 4) -
      (RISK_ORDER[b.maxRisk as keyof typeof RISK_ORDER] ?? 4)
    )

    return result
  }, [riskItems, counterpartyBriefs, search])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Counterparty risk profiles</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>All counterparties in the current monitoring cycle</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-sm ${viewMode === 'cards' ? 'btn-p' : ''}`} onClick={() => setViewMode('cards')}>⊞ Cards</button>
          <button className={`btn btn-sm ${viewMode === 'table' ? 'btn-p' : ''}`} onClick={() => setViewMode('table')}>≡ Table</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search counterparty name or ID…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '7px 14px', borderRadius: 8, border: '1px solid var(--b)',
            fontSize: 13, width: 300, background: 'var(--s)', color: 'var(--t)',
          }}
        />
        <span style={{ fontSize: 13, color: 'var(--t2)' }}>{counterparties.length} counterparties</span>
      </div>

      {riskItems.length === 0 ? (
        <div style={{
          background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
          padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>No counterparty data</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>Run a pipeline to populate counterparty profiles.</div>
          <Link to="/monitor"><button className="btn btn-p">▶ Start pipeline</button></Link>
        </div>
      ) : viewMode === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {counterparties.map(cp => (
            <div key={cp.id} style={{
              background: 'var(--s)', border: `1.5px solid ${RISK_COLORS[cp.maxRisk]}30`,
              borderRadius: 10, padding: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>{cp.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>{cp.id}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
                  color: RISK_COLORS[cp.maxRisk], background: RISK_BG[cp.maxRisk],
                }}>{cp.maxRisk}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--t3)' }}>Max obligation</span>
                  <span style={{ color: 'var(--t)', fontWeight: 600 }}>{cp.maxObligation > 0 ? fmt(cp.maxObligation) : '—'}</span>
                </div>
                {cp.brief && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--t3)' }}>CIS status</span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                        color: cp.brief.cis_status === 'ACTIVE' ? 'var(--gn)' : cp.brief.cis_status === 'DEGRADED' ? 'var(--am)' : 'var(--rd)',
                        background: cp.brief.cis_status === 'ACTIVE' ? 'var(--gnd)' : cp.brief.cis_status === 'DEGRADED' ? 'var(--amd)' : 'var(--rdd)',
                      }}>{cp.brief.cis_status || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--t3)' }}>Lending balance</span>
                      <span style={{
                        color: cp.brief.lending_balance_pct !== undefined && cp.brief.lending_balance_pct < 80 ? 'var(--rd)' : 'var(--gn)',
                        fontWeight: 600,
                      }}>
                        {cp.brief.lending_balance_pct !== undefined ? `${cp.brief.lending_balance_pct}%` : '—'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: 'var(--t3)' }}>Last failure</span>
                      <span style={{ color: 'var(--t)' }}>{cp.brief.last_failure_date || 'None (90d)'}</span>
                    </div>
                    {cp.brief.watchlist_status && (
                      <div style={{ fontSize: 11, color: 'var(--rd)', fontWeight: 700, marginTop: 2 }}>
                        ⚠️ Active JSE watchlist entry
                      </div>
                    )}
                    {cp.brief.root_cause && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: 'var(--t3)' }}>Root cause</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                          color: ROOT_CAUSE_COLORS[cp.brief.root_cause] || 'var(--t2)',
                          background: `${ROOT_CAUSE_COLORS[cp.brief.root_cause] || 'var(--t2)'}20`,
                        }}>{cp.brief.root_cause.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--t3)' }}>Open trades</span>
                  <Link to={`/watchlist?cp=${cp.id}`} style={{ color: 'var(--ac)', fontWeight: 600 }}>
                    {cp.trades.length} trade{cp.trades.length !== 1 ? 's' : ''} →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Counterparty', 'ID', 'Risk tier', 'Max obligation', 'CIS status', 'Lending %', 'Last failure', 'Watchlist', 'Root cause', 'Trades'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {counterparties.map((cp, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--t)' }}>{cp.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>{cp.id}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      color: RISK_COLORS[cp.maxRisk], background: RISK_BG[cp.maxRisk],
                    }}>{cp.maxRisk}</span>
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--t)' }}>
                    {cp.maxObligation > 0 ? fmt(cp.maxObligation) : '—'}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    {cp.brief?.cis_status ? (
                      <span style={{
                        fontSize: 11, padding: '1px 6px', borderRadius: 3, fontWeight: 700,
                        color: cp.brief.cis_status === 'ACTIVE' ? 'var(--gn)' : cp.brief.cis_status === 'DEGRADED' ? 'var(--am)' : 'var(--rd)',
                        background: cp.brief.cis_status === 'ACTIVE' ? 'var(--gnd)' : cp.brief.cis_status === 'DEGRADED' ? 'var(--amd)' : 'var(--rdd)',
                      }}>{cp.brief.cis_status}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: cp.brief?.lending_balance_pct !== undefined && cp.brief.lending_balance_pct < 80 ? 'var(--rd)' : 'var(--gn)' }}>
                    {cp.brief?.lending_balance_pct !== undefined ? `${cp.brief.lending_balance_pct}%` : '—'}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--t2)' }}>{cp.brief?.last_failure_date || 'None (90d)'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {cp.brief?.watchlist_status ? <span style={{ color: 'var(--rd)', fontWeight: 700, fontSize: 11 }}>⚠️ YES</span> : <span style={{ color: 'var(--t3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', fontSize: 11, fontWeight: 600, color: ROOT_CAUSE_COLORS[cp.brief?.root_cause || ''] || 'var(--t3)' }}>
                    {cp.brief?.root_cause?.replace(/_/g, ' ') || '—'}
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <Link to={`/watchlist`} style={{ color: 'var(--ac)', fontWeight: 600 }}>{cp.trades.length}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
