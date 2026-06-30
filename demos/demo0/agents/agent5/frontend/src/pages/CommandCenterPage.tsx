import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ping, listSessions, type Ping, type SessionRow } from '../api/client'
import { getPersona } from '../persona'

/** '/home' — dashboard: readiness tiles, degraded reasons, recent runs, quick actions. */
export function CommandCenterPage() {
  const navigate = useNavigate()
  const persona = getPersona()
  const [health, setHealth] = useState<Ping | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ping().then(setHealth).catch(() => setHealth(null))
    listSessions()
      .then(d => setSessions(d.sessions || []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false))
  }, [])

  const ok = health?.status === 'ok'
  const failing = health?.checks.filter(c => !c.ok) ?? []
  const recent = sessions.slice(0, 8)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Command center</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Operational overview for the <strong>{persona}</strong> persona — readiness, recent runs, and quick actions.
        </p>
      </div>

      {/* Status tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>READINESS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: ok ? 'var(--gn)' : 'var(--am)' }}>
            {health ? (ok ? 'Ready' : 'Degraded') : '—'}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>HEALTH CHECKS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)' }}>
            {health ? `${health.checks.filter(c => c.ok).length}/${health.checks.length}` : '—'}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>VERSION</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)' }}>{health?.version ?? '—'}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>RECENT RUNS</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)' }}>{sessions.length}</div>
        </div>
      </div>

      {/* Degraded reasons */}
      {failing.length > 0 && (
        <div className="card" style={{ marginBottom: 24, background: 'var(--amd)', borderColor: 'var(--am)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--am)', marginBottom: 8 }}>DEGRADED — reasons</div>
          {failing.map(c => (
            <div key={c.name} style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 2 }}>
              <strong>{c.name}</strong>{c.detail ? ` — ${c.detail}` : ''}
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Quick actions</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-p" onClick={() => navigate('/chat')}>Ask the agent</button>
          <button className="btn" onClick={() => navigate('/processing')}>Start a run</button>
          <button className="btn" onClick={() => navigate('/test-runner')}>Run a scenario</button>
          <button className="btn" onClick={() => navigate('/memory')}>View memory</button>
          <button className="btn" onClick={() => navigate('/architecture')}>Architecture</button>
        </div>
      </div>

      {/* Recent runs */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Recent runs</h2>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>Loading…</div>
          ) : recent.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>
              No runs yet. Start one from Processing or Test runner.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--s2)' }}>
                  {['Run', 'Persona', 'Status', 'Trigger', 'Created', 'Events'].map(h => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map(s => (
                  <tr
                    key={s.session_id}
                    onClick={() => navigate('/processing')}
                    style={{ borderTop: '1px solid var(--b)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--s)')}
                  >
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: 'var(--t)' }}>
                      {s.run_id || s.session_id.slice(0, 10)}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{s.persona}</td>
                    <td style={{ padding: '9px 14px' }}>
                      <span className="tag tgr">{s.status}</span>
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{s.trigger_mode || '—'}</td>
                    <td style={{ padding: '9px 14px', color: 'var(--t3)' }}>
                      {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '9px 14px', color: 'var(--t2)' }}>{s.event_count ?? '—'}</td>
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
