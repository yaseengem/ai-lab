import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ping, getPersonas, type Ping, type Persona } from '../api/client'
import { getPersona, clearPersona } from '../persona'

/**
 * Standard ribbon shell: a top bar (agent icon + name + version + live status
 * dot + current persona + "Switch persona") and a left sidebar listing the
 * must-have pages, filtered to the active persona's visible_pages.
 *
 * Sidebar styling follows agent4's App.tsx (CSS variables --s/--b/--ac/--t2…).
 */

// All must-have pages, in display order. The sidebar shows the subset listed in
// the active persona's `visible_pages`; any page id the backend uses that is not
// known here is still rendered (label falls back to the id) so the contract can
// grow without a frontend change.
const PAGE_META: { id: string; path: string; label: string }[] = [
  { id: 'home', path: '/home', label: 'Command center' },
  { id: 'chat', path: '/chat', label: 'Chat' },
  { id: 'processing', path: '/processing', label: 'Processing' },
  { id: 'memory', path: '/memory', label: 'Memory' },
  { id: 'architecture', path: '/architecture', label: 'Architecture' },
  { id: 'test-runner', path: '/test-runner', label: 'Test runner' },
  { id: 'config', path: '/config', label: 'Config' },
]

const META_BY_ID = Object.fromEntries(PAGE_META.map(p => [p.id, p]))

function StatusDot({ status }: { status: Ping['status'] | 'loading' }) {
  const color =
    status === 'ok' ? 'var(--gn)' : status === 'degraded' ? 'var(--am)' : 'var(--t3)'
  const label =
    status === 'ok' ? 'Online' : status === 'degraded' ? 'Degraded' : 'Connecting…'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        title={label}
        style={{
          width: 8, height: 8, borderRadius: '50%', background: color,
          animation: status === 'loading' ? 'pulse 1.2s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--t3)' }}>{label}</span>
    </span>
  )
}

export function Ribbon({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  const navigate = useNavigate()
  const personaId = getPersona()

  const [health, setHealth] = useState<Ping | null>(null)
  const [status, setStatus] = useState<Ping['status'] | 'loading'>('loading')
  const [personas, setPersonas] = useState<Persona[]>([])

  useEffect(() => {
    let alive = true
    const poll = () => {
      ping()
        .then(p => { if (alive) { setHealth(p); setStatus(p.status) } })
        .catch(() => { if (alive) setStatus('degraded') })
    }
    poll()
    const id = setInterval(poll, 10000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    getPersonas().then(d => setPersonas(d.personas)).catch(() => setPersonas([]))
  }, [])

  const persona = personas.find(p => p.id === personaId)
  const visiblePages = persona?.visible_pages ?? PAGE_META.map(p => p.id)
  const navItems = visiblePages.map(id => META_BY_ID[id] ?? { id, path: `/${id}`, label: id })
  // Chat-only personas (Prospect / Sales) get a single page — drop the sidebar entirely
  // so they see just the conversation, nothing else.
  const showSidebar = navItems.length > 1

  const agentName = health?.agent ?? 'AI Agent'
  const version = health?.version

  const switchPersona = () => {
    clearPersona()
    navigate('/')
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <nav style={{
        height: 56, padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', background: 'var(--s)', borderBottom: '1px solid var(--b)',
        flexShrink: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to={persona ? persona.default_landing.startsWith('/') ? persona.default_landing : `/${persona.default_landing}` : '/chat'}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{
              width: 30, height: 30, background: 'var(--ac)', borderRadius: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#fff', fontWeight: 700,
            }}>{(agentName[0] || 'A').toUpperCase()}</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>{agentName}</span>
          </Link>
          {version && (
            <span style={{ fontSize: 11, color: 'var(--t3)', padding: '2px 7px', background: 'var(--s2)', borderRadius: 5 }}>
              v{version}
            </span>
          )}
          <StatusDot status={status} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {persona && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--t2)' }}>
              <span style={{ fontSize: 15 }}>{persona.icon}</span>
              <span style={{ fontWeight: 600, color: 'var(--t)' }}>{persona.label}</span>
            </span>
          )}
          <button className="btn btn-sm" onClick={switchPersona}>Switch persona</button>
        </div>
      </nav>

      {/* Body: sidebar + main */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {showSidebar && (
        <aside style={{
          width: 220, flexShrink: 0, background: 'var(--s)', borderRight: '1px solid var(--b)',
          overflowY: 'auto', padding: '16px 0',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--t3)',
            padding: '8px 20px 4px', textTransform: 'uppercase',
          }}>
            Pages
          </div>
          {navItems.map(item => {
            const active = loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')
            return (
              <Link
                key={item.id}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', padding: '7px 20px',
                  textDecoration: 'none', fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--ac)' : 'var(--t2)',
                  background: active ? 'var(--acd)' : 'transparent',
                  borderLeft: active ? '3px solid var(--ac)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                {item.label}
              </Link>
            )
          })}

          {/* Degraded reasons surfaced inline, so the operator always sees why */}
          {health?.status === 'degraded' && (
            <div style={{ margin: '16px 14px 0', padding: 10, background: 'var(--amd)', borderRadius: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--am)', marginBottom: 4 }}>DEGRADED</div>
              {health.checks.filter(c => !c.ok).map(c => (
                <div key={c.name} style={{ fontSize: 11, color: 'var(--t2)' }}>
                  {c.name}{c.detail ? ` — ${c.detail}` : ''}
                </div>
              ))}
            </div>
          )}
        </aside>
        )}

        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
