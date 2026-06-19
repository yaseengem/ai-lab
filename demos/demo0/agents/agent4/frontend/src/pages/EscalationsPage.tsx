import { useState, useEffect } from 'react'
import { useRun } from '../context/RunContext'
import { Link } from 'react-router-dom'
import { formatDateTime } from '../lib/datetime'

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

const TIMEOUT_MS = 20 * 60 * 1000

function Countdown({ startTime }: { startTime: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, TIMEOUT_MS - (Date.now() - startTime)))

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(prev => Math.max(0, prev - 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const expired = remaining === 0
  const urgent = remaining < 5 * 60000

  return (
    <span style={{
      fontSize: 12, fontWeight: 700,
      color: expired ? 'var(--rd)' : urgent ? 'var(--am)' : 'var(--t2)',
    }}>
      {expired ? '⏰ EXPIRED' : `⏱ ${mins}m ${secs.toString().padStart(2, '0')}s`}
    </span>
  )
}

export function EscalationsPage() {
  const { pendingApprovals, approvalHistory, interventionItems, approve, reject } = useRun()
  const [comments, setComments] = useState<Record<string, string>>({})

  const escalatedItems = interventionItems.filter(i => i.intervention_type === 'HUMAN_ESCALATION')

  const handleApprove = async (itemId: string) => {
    await approve(itemId)
  }
  const handleReject = async (itemId: string) => {
    await reject(itemId)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Human Escalations & Approvals</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>Items requiring human judgment before execution</p>
      </div>

      {/* Pending approvals */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
          Pending Approvals
          {pendingApprovals.length > 0 && (
            <span style={{
              marginLeft: 10, fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: 'var(--rd)', color: '#fff',
            }}>{pendingApprovals.length}</span>
          )}
        </h2>
        {pendingApprovals.length === 0 ? (
          <div style={{
            background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
            padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)',
          }}>
            ✓ No pending approvals
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {pendingApprovals.map(item => (
              <div key={item.item_id} style={{
                background: 'var(--s)', border: '2px solid var(--am)', borderRadius: 10, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 20px', background: 'var(--amd)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--am)' }}>
                    ⚠️ LOLR Transaction — Approval Required
                  </span>
                  {item.timestamp && <Countdown startTime={item.timestamp} />}
                </div>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>TRADE ID</div>
                      <Link to={`/watchlist/${encodeURIComponent(item.trade_id)}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ac)' }}>
                        {item.trade_id}
                      </Link>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>COUNTERPARTY</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{item.counterparty_id}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 3 }}>ESTIMATED COST</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--rd)' }}>{fmt(item.value_zar)}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>ISIN: </span>
                    <span style={{ fontSize: 12, color: 'var(--t)', fontFamily: 'monospace' }}>{item.isin}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--t)', lineHeight: 1.6, marginBottom: 14 }}>{item.rationale}</div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                      COMMENT (optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Add approval notes…"
                      value={comments[item.item_id] || ''}
                      onChange={e => setComments(prev => ({ ...prev, [item.item_id]: e.target.value }))}
                      style={{
                        width: '100%', padding: '7px 12px', borderRadius: 7,
                        border: '1px solid var(--b)', fontSize: 12, background: 'var(--s2)', color: 'var(--t)',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-p" onClick={() => handleApprove(item.item_id)}
                      style={{ fontWeight: 700 }}>
                      ✓ Approve LOLR Transaction
                    </button>
                    <button
                      className="btn"
                      onClick={() => handleReject(item.item_id)}
                      style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}
                    >
                      ✕ Reject → Escalate Further
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Escalated items (HUMAN_ESCALATION intervention type) */}
      {escalatedItems.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Escalated Items
            <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 400, color: 'var(--t2)' }}>
              Requires senior review — agent determined human judgment necessary
            </span>
          </h2>
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--s2)' }}>
                  {['Trade ID', 'Counterparty', 'Rationale', 'Cost (Est.)', 'Priority'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {escalatedItems.map((item, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--b)', background: 'var(--rdd)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--t)' }}>
                      <Link to={`/watchlist/${encodeURIComponent(item.trade_id)}`} style={{ color: 'var(--ac)' }}>
                        {item.trade_id}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--t)' }}>{item.counterparty_name || item.counterparty_id}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--t2)', maxWidth: 320 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.rationale || 'Requires human judgment — see risk brief'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--t)', fontWeight: 600 }}>
                      {item.estimated_cost_zar ? fmt(item.estimated_cost_zar) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--pu)', fontWeight: 700, fontSize: 11 }}>
                      HUMAN ESCALATION
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval history */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Approval History</h2>
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
          {approvalHistory.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
              No decisions recorded yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--s2)' }}>
                  {['Item ID', 'Trade ID', 'Decision', 'Approver', 'Timestamp', 'Comment'].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...approvalHistory].reverse().map((d, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>{d.item_id}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t)' }}>
                      <Link to={`/watchlist/${encodeURIComponent(d.trade_id)}`} style={{ color: 'var(--ac)' }}>
                        {d.trade_id}
                      </Link>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        color: d.decision === 'approved' ? 'var(--gn)' : 'var(--rd)',
                        background: d.decision === 'approved' ? 'var(--gnd)' : 'var(--rdd)',
                      }}>{d.decision.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{d.approver_id}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t3)', fontSize: 11 }}>
                      {formatDateTime(d.timestamp)}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{d.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
