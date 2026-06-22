import { useEffect, useState } from 'react'
import { getMemory } from '../api/client'

/** '/memory' — render GET /memory (rules / preferences). Read-only view. */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function Section({ title, value }: { title: string; value: unknown }) {
  // Render arrays of rules/preferences as a list; objects as key/value; else JSON.
  let body: React.ReactNode
  if (Array.isArray(value)) {
    body = value.length === 0 ? (
      <div style={{ fontSize: 13, color: 'var(--t3)' }}>None.</div>
    ) : (
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {value.map((item, i) => (
          <li key={i} style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>
            {typeof item === 'string' ? item : <code style={{ fontSize: 12 }}>{JSON.stringify(item)}</code>}
          </li>
        ))}
      </ul>
    )
  } else if (isRecord(value)) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600, color: 'var(--t)', minWidth: 160 }}>{k}</span>
            <span style={{ color: 'var(--t2)' }}>
              {typeof v === 'object' ? <code style={{ fontSize: 12 }}>{JSON.stringify(v)}</code> : String(v)}
            </span>
          </div>
        ))}
      </div>
    )
  } else {
    body = <div style={{ fontSize: 13, color: 'var(--t2)' }}>{String(value)}</div>
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {body}
    </div>
  )
}

export function MemoryPage() {
  const [memory, setMemory] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMemory()
      .then(d => setMemory(d.memory))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Memory</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          The agent's persisted memory — rules and preferences applied on every run. Edit rules via Chat (admin persona).
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading memory…</div>
      ) : error ? (
        <div style={{ color: 'var(--rd)', fontSize: 13 }}>Could not load memory: {error}</div>
      ) : isRecord(memory) ? (
        Object.keys(memory).length === 0 ? (
          <div className="card" style={{ color: 'var(--t3)', fontSize: 13 }}>Memory is empty.</div>
        ) : (
          Object.entries(memory).map(([k, v]) => <Section key={k} title={k} value={v} />)
        )
      ) : (
        <div className="card">
          <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--t2)' }}>
            {JSON.stringify(memory, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
