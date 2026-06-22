import { useEffect, useState } from 'react'

interface Demo {
  id: string
  name: string
  description: string
  url?: string
  status: 'active' | 'under_development'
}

interface Manifest {
  appName: string
  tagline?: string
  demos: Demo[]
}

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/demos.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load demos (${r.status})`)
        return r.json()
      })
      .then(setManifest)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 24px' }}>
      <header style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1, color: 'var(--ac)', textTransform: 'uppercase' }}>
          {manifest?.appName ?? 'AI Lab'}
        </div>
        <h1 style={{ fontSize: 40, fontWeight: 800, margin: '8px 0 6px' }}>
          {manifest?.appName ?? 'AI Lab'}
        </h1>
        <p style={{ fontSize: 16, color: 'var(--t2)', margin: 0 }}>
          {manifest?.tagline ?? 'Enterprise AI demonstration platform'}
        </p>
      </header>

      {error && (
        <div style={{ color: 'var(--am)', background: 'var(--amd)', padding: 16, borderRadius: 10 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 20,
        }}
      >
        {manifest?.demos.map((demo) => (
          <DemoCard key={demo.id} demo={demo} />
        ))}
      </div>
    </div>
  )
}

function DemoCard({ demo }: { demo: Demo }) {
  const isActive = demo.status === 'active' && !!demo.url

  const card = (
    <div
      style={{
        background: 'var(--s)',
        border: '1px solid var(--b)',
        borderRadius: 14,
        padding: 24,
        height: '100%',
        opacity: isActive ? 1 : 0.7,
        cursor: isActive ? 'pointer' : 'default',
        transition: 'box-shadow .15s, transform .15s',
      }}
      onMouseEnter={(e) => {
        if (isActive) {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(15,23,42,0.08)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>{demo.id}</span>
        <StatusBadge status={demo.status} />
      </div>
      <h2 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>{demo.name}</h2>
      <p style={{ fontSize: 14, color: 'var(--t2)', margin: 0 }}>{demo.description}</p>
    </div>
  )

  if (isActive) {
    return (
      <a href={demo.url} target="_blank" rel="noreferrer">
        {card}
      </a>
    )
  }
  return card
}

function StatusBadge({ status }: { status: Demo['status'] }) {
  const active = status === 'active'
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 999,
        color: active ? 'var(--gn)' : 'var(--am)',
        background: active ? 'var(--gnd)' : 'var(--amd)',
      }}
    >
      {active ? 'Active' : 'Under development'}
    </span>
  )
}
