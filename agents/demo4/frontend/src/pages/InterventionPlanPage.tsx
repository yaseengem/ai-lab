import { Link } from 'react-router-dom'
import { useRun } from '../context/RunContext'

const INT_COLORS: Record<string, string> = {
  LOLR_TRIGGER: 'var(--rd)', SETTLEMENT_ROLL: 'var(--am)',
  ALERT_OPERATIONS: 'var(--ac)', HUMAN_ESCALATION: 'var(--pu)', MONITOR_ONLY: 'var(--t3)',
}
const INT_BG: Record<string, string> = {
  LOLR_TRIGGER: 'var(--rdd)', SETTLEMENT_ROLL: 'var(--amd)',
  ALERT_OPERATIONS: 'var(--acd)', HUMAN_ESCALATION: 'var(--pud)', MONITOR_ONLY: 'var(--s2)',
}

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

const INT_ORDER = ['LOLR_TRIGGER', 'SETTLEMENT_ROLL', 'ALERT_OPERATIONS', 'HUMAN_ESCALATION', 'MONITOR_ONLY']
const INT_LABELS: Record<string, string> = {
  LOLR_TRIGGER: 'LOLR Trigger', SETTLEMENT_ROLL: 'Settlement Roll',
  ALERT_OPERATIONS: 'Alert Operations', HUMAN_ESCALATION: 'Human Escalation', MONITOR_ONLY: 'Monitor Only',
}

export function InterventionPlanPage() {
  const { interventionItems, approve } = useRun()

  const grouped = INT_ORDER.reduce((acc, type) => {
    acc[type] = interventionItems.filter(i => i.intervention_type === type)
    return acc
  }, {} as Record<string, typeof interventionItems>)

  const totalCost = interventionItems.reduce((sum, i) => sum + (i.estimated_cost_zar || 0), 0)
  const lolrItems = grouped['LOLR_TRIGGER']
  const pendingLolr = lolrItems.filter(i => !i.requires_human_approval)

  const handleApproveAll = async () => {
    for (const item of pendingLolr) {
      await approve(item.trade_id)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Intervention Plan</h1>
          <p style={{ fontSize: 13, color: 'var(--t2)' }}>Current cycle — Step 4 output</p>
        </div>
        {interventionItems.length > 0 && (
          <div style={{ display: 'flex', gap: 10 }}>
            {pendingLolr.length > 0 && (
              <button
                className="btn btn-sm"
                style={{ color: 'var(--rd)', borderColor: 'var(--rd)', fontWeight: 700 }}
                onClick={handleApproveAll}
              >
                ✓ Approve All LOLR ({pendingLolr.length})
              </button>
            )}
            <Link to="/escalations"><button className="btn btn-sm">View Escalations →</button></Link>
          </div>
        )}
      </div>

      {interventionItems.length === 0 ? (
        <div style={{
          background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
          padding: 60, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚖️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>No intervention plan yet</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16 }}>
            The intervention plan is generated after Step 4 completes.
          </div>
          <Link to="/monitor"><button className="btn btn-p">▶ Start Pipeline</button></Link>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {INT_ORDER.filter(t => grouped[t].length > 0).map(type => (
              <div key={type} style={{
                background: 'var(--s)', border: `1.5px solid ${INT_COLORS[type]}30`,
                borderRadius: 10, padding: '14px 20px', flex: 1, minWidth: 120,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: INT_COLORS[type] }}>{grouped[type].length}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>{INT_LABELS[type]}</div>
              </div>
            ))}
            {totalCost > 0 && (
              <div style={{
                background: 'var(--s)', border: '1.5px solid var(--tl)30', borderRadius: 10,
                padding: '14px 20px', flex: 1, minWidth: 120,
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--tl)' }}>{fmt(totalCost)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>Total Est. Cost</div>
              </div>
            )}
          </div>

          {/* Grouped sections */}
          {INT_ORDER.filter(type => grouped[type].length > 0).map(type => (
            <div key={type} style={{
              background: 'var(--s)', border: `1.5px solid ${INT_COLORS[type]}40`,
              borderRadius: 10, overflow: 'hidden', marginBottom: 16,
            }}>
              <div style={{
                padding: '12px 20px', background: INT_BG[type],
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: INT_COLORS[type] }}>
                  {INT_LABELS[type]}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 10,
                  background: INT_COLORS[type], color: '#fff',
                }}>{grouped[type].length}</span>
                {type === 'LOLR_TRIGGER' && (
                  <span style={{ fontSize: 11, color: 'var(--t2)', marginLeft: 'auto' }}>
                    Est. total: {fmt(grouped[type].reduce((s, i) => s + (i.estimated_cost_zar || 0), 0))}
                  </span>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--s2)' }}>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Trade ID</th>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Counterparty</th>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Rationale</th>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Cost (Est.)</th>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Priority</th>
                    <th style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[type].map((item, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                      <td style={{ padding: '9px 16px', fontWeight: 600, color: 'var(--t)' }}>
                        <Link to={`/watchlist/${encodeURIComponent(item.trade_id)}`} style={{ color: 'var(--ac)' }}>
                          {item.trade_id}
                        </Link>
                      </td>
                      <td style={{ padding: '9px 16px', color: 'var(--t)' }}>{item.counterparty_name || item.counterparty_id}</td>
                      <td style={{ padding: '9px 16px', color: 'var(--t2)', maxWidth: 300 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.rationale || '—'}
                        </div>
                      </td>
                      <td style={{ padding: '9px 16px', color: item.estimated_cost_zar ? 'var(--t)' : 'var(--t3)', fontWeight: item.estimated_cost_zar ? 600 : 400 }}>
                        {item.estimated_cost_zar ? fmt(item.estimated_cost_zar) : '—'}
                      </td>
                      <td style={{ padding: '9px 16px', color: 'var(--t2)' }}>
                        {item.execution_priority !== undefined ? `P${item.execution_priority}` : '—'}
                      </td>
                      <td style={{ padding: '9px 16px' }}>
                        {item.requires_human_approval ? (
                          <span style={{ fontSize: 11, color: 'var(--am)', fontWeight: 700 }}>🔒 Required</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--gn)' }}>Auto</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
