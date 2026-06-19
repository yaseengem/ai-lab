import { useState } from 'react'

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API_URL ?? 'http://localhost:5001'

interface Props {
  onSuccess: (username: string) => void
  onClose: () => void
}

export function SignInModal({ onSuccess, onClose }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      onSuccess(data.username)
    } catch {
      setError('Could not reach the platform backend.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: '32px 36px', width: 360, boxShadow: '0 12px 40px rgba(0,0,0,.12)' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Sign in</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>Use your platform credentials.</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--bg)', color: 'var(--t)', outline: 'none' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--bg)', color: 'var(--t)', outline: 'none' }}
          />
          {error && (
            <div style={{ fontSize: 12, color: 'var(--rd)', background: 'var(--rdd)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-sm" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-sm btn-p" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
