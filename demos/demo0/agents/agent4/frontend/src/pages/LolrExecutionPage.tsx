import { Link } from 'react-router-dom'
import { useRun } from '../context/RunContext'
import { formatDateTime } from '../lib/datetime'

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

const LOLR_LIMIT = 500_000_000

const STATUS_COLORS: Record<string, string> = {
  'Confirmed': 'var(--gn)', 'Pending': 'var(--t3)',
  'Failed': 'var(--rd)', 'Awaiting Approval': 'var(--am)',
}
const STATUS_BG: Record<string, string> = {
  'Confirmed': 'var(--gnd)', 'Pending': 'var(--s2)',
  'Failed': 'var(--rdd)', 'Awaiting Approval': 'var(--amd)',
}

export function LolrExecutionPage() {
  const { lolrItems, lolrTotalZar, pendingApprovals, approve, reject } = useRun()

  const guardPct = Math.min((lolrTotalZar / LOLR_LIMIT) * 100, 100)
  const guardColor = guardPct > 95 ? 'var(--rd)' : guardPct > 80 ? 'var(--am)' : 'var(--gn)'

  const confirmed = lolrItems.filter(l => l.status === 'Confirmed')
  const failed = lolrItems.filter(l => l.status === 'Failed')
  const pending = lolrItems.filter(l => l.status === 'Pending')
  const awaitingApproval = lolrItems.filter(l => l.status === 'Awaiting Approval')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>LOLR Execution</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>Lender-of-Last-Resort transactions — Step 5</p>
      </div>

      {/* ZAR 500M guard */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Auto-Execution Cap</span>
            <span style={{ fontSize: 12, color: 'var(--t2)', marginLeft: 8 }}>ZAR 500M per cycle limit</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: guardColor }}>{fmt(lolrTotalZar)}</span>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}> / {fmt(LOLR_LIMIT)}</span>
          </div>
        </div>
        <div style={{ height: 12, background: 'var(--s2)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${guardPct}%`, background: guardColor,
            borderRadius: 6, transition: 'width 0.5s, background 0.3s',
          }} />
        </div>
        {guardPct > 95 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--rd)', fontWeight: 600 }}>
            🛑 Guard limit nearly reached — additional transactions require manual approval
          </div>
        )}
      </div>

      {/* Stats row */}
      {lolrItems.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Confirmed', count: confirmed.length, color: 'var(--gn)' },
            { label: 'Pending', count: pending.length, color: 'var(--t3)' },
            { label: 'Awaiting Approval', count: awaitingApproval.length, color: 'var(--am)' },
            { label: 'Failed', count: failed.length, color: 'var(--rd)' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 8,
              padding: '12px 18px', flex: 1,
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pending approvals */}
      {pendingApprovals.length > 0 && (
        <div style={{
          background: 'var(--amd)', border: '2px solid var(--am)', borderRadius: 10,
          padding: 20, marginBottom: 20,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--am)', marginBottom: 14 }}>
            ⚠️ {pendingApprovals.length} LOLR Transaction{pendingApprovals.length > 1 ? 's' : ''} Awaiting Approval
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pendingApprovals.map(item => (
              <div key={item.item_id} style={{
                background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 8, padding: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{item.trade_id}</span>
                    <span style={{ fontSize: 12, color: 'var(--t2)', marginLeft: 10 }}>{item.counterparty_id}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--rd)' }}>{fmt(item.value_zar)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 4 }}>
                  <b>ISIN:</b> {item.isin}
                </div>
                <div style={{ fontSize: 12, color: 'var(--t)', marginBottom: 12 }}>{item.rationale}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-p btn-sm" onClick={() => approve(item.item_id)}>✓ Approve LOLR</button>
                  <button
                    className="btn btn-sm"
                    style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}
                    onClick={() => reject(item.item_id)}
                  >✕ Reject → Escalate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution log */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Execution Log</h3>
        </div>
        {lolrItems.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>💰</div>
            No LOLR transactions in this cycle.<br />
            <Link to="/monitor" style={{ color: 'var(--ac)' }}>Run a pipeline to see LOLR data →</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Trade ID', 'Counterparty', 'ISIN', 'Direction', 'Value', 'Status', 'Confirmation ID', 'Timestamp'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lolrItems.map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--b)', background: 'var(--s)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t)' }}>
                    <Link to={`/watchlist/${encodeURIComponent(item.trade_id)}`} style={{ color: 'var(--ac)' }}>
                      {item.trade_id}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t)' }}>{item.counterparty_id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>{item.isin}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.direction ? (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        color: item.direction === 'LEND' ? 'var(--tl)' : 'var(--pu)',
                        background: item.direction === 'LEND' ? 'var(--tld)' : 'var(--pud)',
                      }}>{item.direction}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t)' }}>
                    {item.value_zar > 0 ? fmt(item.value_zar) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      color: STATUS_COLORS[item.status], background: STATUS_BG[item.status],
                    }}>{item.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>
                    {item.confirmation_id || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t3)', fontSize: 11 }}>
                    {formatDateTime(item.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Failed transactions */}
      {failed.length > 0 && (
        <div style={{
          background: 'var(--rdd)', border: '1px solid var(--rd)', borderRadius: 10,
          padding: 16, marginTop: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--rd)', marginBottom: 8 }}>
            ⚠️ {failed.length} Failed Transaction{failed.length > 1 ? 's' : ''}
          </div>
          {failed.map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--rd)', marginBottom: 4 }}>
              {item.trade_id} — {item.counterparty_id}
              {item.retry_count !== undefined && <span style={{ marginLeft: 8 }}>Retries: {item.retry_count}</span>}
              <Link to="/escalations" style={{ marginLeft: 12, color: 'var(--rd)', fontWeight: 600 }}>Escalate →</Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
