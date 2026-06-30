import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import mermaid from 'mermaid'
import { getArchitecture, getConfig, type AgentConfig, type Capability } from '../api/client'

/**
 * '/architecture' — render GET /architecture markdown with react-markdown, and
 * render any ```mermaid fenced blocks via mermaid. Also show the capabilities
 * manifest from getConfig().capabilities.
 */

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' })

let _mid = 0

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const id = `mmd-${++_mid}`
    mermaid
      .render(id, code)
      .then(({ svg }) => { if (!cancelled && ref.current) ref.current.innerHTML = svg })
      .catch(e => { if (!cancelled) setErr(String(e)) })
    return () => { cancelled = true }
  }, [code])

  if (err) {
    return (
      <pre style={{ background: '#0d1117', color: '#f85149', padding: 14, borderRadius: 8, fontSize: 12, overflowX: 'auto' }}>
        Diagram failed to render: {err}
        {'\n\n'}{code}
      </pre>
    )
  }
  return (
    <div
      ref={ref}
      style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16, margin: '14px 0', overflowX: 'auto' }}
    />
  )
}

function asCapabilities(caps: AgentConfig['capabilities']): Capability[] {
  if (Array.isArray(caps)) return caps
  return Object.entries(caps).map(([id, v]) =>
    typeof v === 'object' && v !== null ? { id, name: id, ...(v as object) } : { id, name: id, enabled: Boolean(v) },
  )
}

export function ArchitecturePage() {
  const [markdown, setMarkdown] = useState('')
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getArchitecture(), getConfig().catch(() => null)])
      .then(([arch, cfg]) => {
        setMarkdown(arch.markdown || '')
        if (cfg) setCapabilities(asCapabilities(cfg.capabilities))
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Architecture</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          How this agent is built — narrative, diagrams, and its declared capabilities.
        </p>
      </div>

      {/* Capabilities manifest */}
      {capabilities.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.05em', marginBottom: 10, textTransform: 'uppercase' }}>
            Capabilities
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {capabilities.map((c, i) => (
              <span key={c.id ?? c.name ?? i} className="tag tb" title={c.description}>
                {c.name ?? c.id}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading architecture…</div>
      ) : error ? (
        <div style={{ color: 'var(--rd)', fontSize: 13 }}>Could not load architecture: {error}</div>
      ) : !markdown ? (
        <div className="card" style={{ color: 'var(--t3)', fontSize: 13 }}>No architecture document provided.</div>
      ) : (
        <div className="md card">
          <ReactMarkdown
            components={{
              code(props) {
                const { className, children } = props as { className?: string; children?: React.ReactNode }
                const text = String(children ?? '')
                if (className?.includes('language-mermaid')) {
                  return <MermaidBlock code={text.replace(/\n$/, '')} />
                }
                return <code className={className}>{children}</code>
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
