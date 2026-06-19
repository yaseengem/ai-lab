import { useState } from 'react'
import { useRun } from '../context/RunContext'
import { formatDateTime } from '../lib/datetime'

const SEV_COLORS: Record<string, string> = { HIGH: 'var(--rd)', MEDIUM: 'var(--am)', LOW: 'var(--ac)' }
const SEV_BG: Record<string, string> = { HIGH: 'var(--rdd)', MEDIUM: 'var(--amd)', LOW: 'var(--acd)' }

export function AlertsPage() {
  const { alerts, acknowledgeAlert } = useRun()
  const [prefEmail, setPrefEmail] = useState(false)
  const [prefSMS, setPrefSMS] = useState(false)
  const [prefInApp, setPrefInApp] = useState(true)

  const active = alerts.filter(a => !a.acknowledged)
  const history = alerts.filter(a => a.acknowledged)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Alerts & Notifications</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>System alerts from the settlement failure prevention pipeline</p>
      </div>

      {/* Active alerts */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Active Alerts</h2>
          {active.length > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: 'var(--rd)', color: '#fff',
            }}>{active.length}</span>
          )}
        </div>

        {active.length === 0 ? (
          <div style={{
            background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
            padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--t3)',
          }}>
            ✓ No active alerts — all clear
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map(alert => (
              <div key={alert.id} style={{
                background: SEV_BG[alert.severity], border: `1.5px solid ${SEV_COLORS[alert.severity]}`,
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                <span style={{ fontSize: 18, marginTop: 2 }}>
                  {alert.severity === 'HIGH' ? '🚨' : alert.severity === 'MEDIUM' ? '⚠️' : 'ℹ️'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                      color: SEV_COLORS[alert.severity], background: `${SEV_COLORS[alert.severity]}20`,
                    }}>{alert.severity}</span>
                    {alert.source_step && (
                      <span style={{ fontSize: 11, color: 'var(--t2)' }}>Step {alert.source_step}</span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--t3)', marginLeft: 'auto' }}>
                      {formatDateTime(alert.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--t)', fontWeight: 500 }}>{alert.message}</div>
                  {alert.session_id && (
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>
                      Session: {alert.session_id.slice(0, 12)}…
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => acknowledgeAlert(alert.id)}
                  style={{ flexShrink: 0, fontSize: 11 }}
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alert history */}
      {history.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Alert History</h2>
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--s2)' }}>
                  {['Severity', 'Message', 'Step', 'Session', 'Timestamp'].map(h => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((alert, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        color: SEV_COLORS[alert.severity], background: SEV_BG[alert.severity],
                      }}>{alert.severity}</span>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t)', maxWidth: 360 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alert.message}
                      </div>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>
                      {alert.source_step ? `Step ${alert.source_step}` : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t3)', fontFamily: 'monospace', fontSize: 11 }}>
                      {alert.session_id?.slice(0, 8) || '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t3)', fontSize: 11 }}>
                      {formatDateTime(alert.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Notification preferences */}
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>Notification Preferences</h3>
        <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 16 }}>
          Display only — configure actual delivery channels in AWS SNS settings.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { label: 'In-App Alerts', sub: 'Shown in this panel', checked: prefInApp, set: setPrefInApp },
            { label: 'Email Notifications', sub: 'via Amazon SES (ops team distribution list)', checked: prefEmail, set: setPrefEmail },
            { label: 'SMS Alerts', sub: 'via Amazon SNS — HIGH severity only', checked: prefSMS, set: setPrefSMS },
          ].map(pref => (
            <label key={pref.label} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={pref.checked}
                onChange={e => pref.set(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontSize: 13, color: 'var(--t)', fontWeight: 500 }}>{pref.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{pref.sub}</div>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
