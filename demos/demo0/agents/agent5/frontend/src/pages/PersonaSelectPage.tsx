import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPersonas, ping, type Persona, type Ping } from '../api/client'
import { setPersona } from '../persona'

/**
 * Route '/' — the START POINT and the gate. Pick a persona, which scopes the
 * rest of the app (visible_pages) and lands you on that persona's
 * default_landing (normally '/chat').
 */
export function PersonaSelectPage() {
  const navigate = useNavigate()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [health, setHealth] = useState<Ping | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPersonas()
      .then(d => setPersonas(d.personas))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
    ping().then(setHealth).catch(() => {})
  }, [])

  const choose = (p: Persona) => {
    setPersona(p.id)
    const landing = p.default_landing || 'chat'
    navigate(landing.startsWith('/') ? landing : `/${landing}`)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '64px 32px' }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, background: 'var(--ac)', borderRadius: 10, margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', fontWeight: 700,
          }}>{(health?.agent?.[0] || 'A').toUpperCase()}</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>
            {health?.agent ?? 'AI Agent'}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--t2)' }}>
            Choose how you want to use this agent. Your choice tailors which pages and actions you see.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 48 }}>Loading personas…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: 'var(--rd)', padding: 48 }}>
            Could not load personas: {error}
          </div>
        ) : personas.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--t3)', padding: 48 }}>No personas configured.</div>
        ) : (
          <div style={{
            marginTop: 36, display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(personas.length, 3)}, 1fr)`, gap: 20,
          }}>
            {personas.map(p => (
              <button
                key={p.id}
                onClick={() => choose(p)}
                style={{
                  textAlign: 'left', cursor: 'pointer', background: 'var(--s)',
                  border: '1px solid var(--b)', borderRadius: 12, padding: 22,
                  display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ac)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,99,235,0.10)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--b)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ fontSize: 30 }}>{p.icon}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>{p.label}</div>
                <p style={{ fontSize: 13, color: 'var(--t2)', margin: 0, lineHeight: 1.55 }}>{p.description}</p>

                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.06em', marginBottom: 6 }}>
                    WHAT YOU CAN SEE
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.visible_pages.map(pg => (
                      <span key={pg} className="tag tgr" style={{ fontSize: 10 }}>{pg}</span>
                    ))}
                  </div>
                </div>

                <span style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>
                  Continue as {p.label} →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
