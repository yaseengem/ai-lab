import { Link } from 'react-router-dom'
import { useRun } from '../context/RunContext'

const STATUS_COLORS: Record<string, string> = {
  'Confirmed': 'var(--gn)', 'Submitted': 'var(--ac)',
  'Failed': 'var(--rd)', 'Ineligible': 'var(--am)',
}
const STATUS_BG: Record<string, string> = {
  'Confirmed': 'var(--gnd)', 'Submitted': 'var(--acd)',
  'Failed': 'var(--rdd)', 'Ineligible': 'var(--amd)',
}

export function SettlementRollPage() {
  const { rollItems } = useRun()

  const submitted = rollItems.filter(r => r.status === 'Submitted' || r.status === 'Confirmed')
  const confirmed = rollItems.filter(r => r.status === 'Confirmed')
  const failed = rollItems.filter(r => r.status === 'Failed')
  const ineligible = rollItems.filter(r => r.status === 'Ineligible')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Settlement rolls</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>Strate roll instructions — Step 6</p>
      </div>

      {/* Stats */}
      {rollItems.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total rolls', count: submitted.length, color: 'var(--ac)' },
            { label: 'Confirmed', count: confirmed.length, color: 'var(--gn)' },
            { label: 'Failed', count: failed.length, color: 'var(--rd)' },
            { label: 'Ineligible', count: ineligible.length, color: 'var(--am)' },
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

      {/* Roll log */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--b)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>Roll log</h3>
        </div>
        {rollItems.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', fontSize: 13, color: 'var(--t3)' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            No settlement rolls in this cycle.<br />
            <Link to="/monitor" style={{ color: 'var(--ac)' }}>Run a pipeline to see roll data →</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--s2)' }}>
                {['Trade ID', 'Counterparty', 'Original date', 'New date', 'Reason', 'Strate ref', 'CP notified', 'Status'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rollItems.filter(r => r.status !== 'Ineligible').map((item, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t)' }}>
                    <Link to={`/watchlist/${encodeURIComponent(item.trade_id)}`} style={{ color: 'var(--ac)' }}>
                      {item.trade_id}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t)' }}>{item.counterparty_id}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontSize: 11 }}>
                    {item.original_settlement_date || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: item.new_settlement_date ? 'var(--am)' : 'var(--t3)', fontSize: 11, fontWeight: item.new_settlement_date ? 600 : 400 }}>
                    {item.new_settlement_date || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.reason_code ? (
                      <span style={{ fontSize: 11, color: 'var(--t2)', background: 'var(--s2)', padding: '2px 6px', borderRadius: 4 }}>
                        {item.reason_code.replace(/_/g, ' ')}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--t2)', fontFamily: 'monospace', fontSize: 11 }}>
                    {item.strate_confirmation_ref || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {item.counterparty_notified === true
                      ? <span style={{ color: 'var(--gn)', fontSize: 11 }}>✓ Yes</span>
                      : item.counterparty_notified === false
                        ? <span style={{ color: 'var(--am)', fontSize: 11 }}>Pending</span>
                        : <span style={{ color: 'var(--t3)', fontSize: 11 }}>—</span>
                    }
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                      color: STATUS_COLORS[item.status], background: STATUS_BG[item.status],
                    }}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ineligible trades */}
      {ineligible.length > 0 && (
        <div style={{
          background: 'var(--amd)', border: '1.5px solid var(--am)', borderRadius: 10, padding: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--am)', marginBottom: 12 }}>
            ⚠️ Ineligible trades — escalated to human review ({ineligible.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ineligible.map((item, i) => (
              <div key={i} style={{
                background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 8,
                padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--t)', fontSize: 12 }}>{item.trade_id}</span>
                  <span style={{ color: 'var(--t2)', fontSize: 12, marginLeft: 10 }}>{item.counterparty_id}</span>
                  {item.ineligible_reason && (
                    <span style={{ color: 'var(--am)', fontSize: 11, marginLeft: 10 }}>— {item.ineligible_reason}</span>
                  )}
                </div>
                <Link to="/escalations">
                  <button className="btn btn-sm" style={{ fontSize: 11, color: 'var(--am)', borderColor: 'var(--am)' }}>
                    View escalation →
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
