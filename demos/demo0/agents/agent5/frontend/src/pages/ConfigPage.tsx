import { useEffect, useState } from 'react'
import { getConfig, type AgentConfig, type Capability } from '../api/client'

// Render a config value as friendly text (no raw JSON for the common cases).
function prettyValue(v: unknown): string {
  if (v === '' || v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * '/config' — read-only view of GET /config (personas / defaults / features /
 * capabilities). Editing happens at the platform level, not here.
 */

function asCapabilities(caps: AgentConfig['capabilities']): Capability[] {
  if (Array.isArray(caps)) return caps
  return Object.entries(caps).map(([id, v]) =>
    typeof v === 'object' && v !== null
      ? { id, name: id, ...(v as object) }
      : { id, name: id, enabled: Boolean(v) },
  )
}

function KeyValueCard({ title, data }: { title: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data || {})
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--t3)' }}>None.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: 'var(--t)', minWidth: 180 }}>{k}</span>
              <span style={{ color: 'var(--t2)', wordBreak: 'break-word' }}>
                {prettyValue(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ConfigPage() {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Config</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Read-only view of the agent configuration. Changes are made at the platform level, not here.
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading config…</div>
      ) : error ? (
        <div style={{ color: 'var(--rd)', fontSize: 13 }}>Could not load config: {error}</div>
      ) : config ? (
        <>
          {/* Personas */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
              Personas
            </div>
            {config.personas.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>None.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {config.personas.map(p => (
                  <div key={p.id} style={{ borderTop: '1px solid var(--b)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{p.icon}</span>
                      <span style={{ fontWeight: 700, color: 'var(--t)' }}>{p.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>({p.id})</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--t2)', margin: '4px 0 6px' }}>{p.description}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {p.visible_pages.map(pg => <span key={pg} className="tag tgr" style={{ fontSize: 10 }}>{pg}</span>)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 5 }}>landing: {p.default_landing}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Capabilities manifest */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
              Capabilities
            </div>
            {asCapabilities(config.capabilities).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>None declared.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {asCapabilities(config.capabilities).map((c, i) => (
                  <div key={c.id ?? c.name ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: c.enabled === false ? 'var(--t3)' : 'var(--gn)',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{c.name ?? c.id}</span>
                    {c.description && <span style={{ fontSize: 12, color: 'var(--t2)' }}>— {c.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <KeyValueCard title="Defaults" data={config.defaults} />
          <KeyValueCard title="Features" data={config.features} />

          {/* Connected systems (read-only; connect/disconnect happens at platform level) */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
              Connected systems
            </div>
            {!config.integrations || config.integrations.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>None declared.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {config.integrations.map(it => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: it.connected ? 'var(--gn)' : 'var(--t3)',
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>{it.name}</span>
                    {it.category && <span className="tag tgr" style={{ fontSize: 10 }}>{it.category}</span>}
                    <span style={{ fontSize: 12, color: it.connected ? 'var(--gn)' : 'var(--t3)' }}>
                      {it.connected ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
