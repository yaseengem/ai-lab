import { useState } from 'react'

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API_URL ?? 'http://localhost:5001'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<string | null>(() => localStorage.getItem('auth_user'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (user) return <>{children}</>

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`${PLATFORM_API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        setError('Invalid username or password.')
        return
      }
      const data = await res.json()
      localStorage.setItem('auth_token', data.token)
      localStorage.setItem('auth_user', data.username)
      setUser(data.username)
    } catch {
      setError('Could not reach the platform backend.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginBottom: 32 }}>
        <img src="/logo.png" alt="Neural AI" style={{ height: 36, width: 'auto' }} />
      </div>
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: '36px 40px', width: 360, boxShadow: '0 8px 32px rgba(0,0,0,.08)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>Enter your platform credentials to continue.</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--bg)', color: 'var(--t)', outline: 'none' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--bg)', color: 'var(--t)', outline: 'none' }}
          />
          {error && (
            <div style={{ fontSize: 12, color: 'var(--rd)', background: 'var(--rdd)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-p" style={{ marginTop: 4 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
