import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAgents, type PlatformAgent } from '@/api/platform'

const SIDEBAR_LINKS = [
  { section: 'Workspace', items: [
    { label: 'My agents', icon: '🤖', path: '/dashboard' },
    { label: 'Usage', icon: '📊', path: '/dashboard/usage' },
    { label: 'Billing', icon: '💳', path: '/dashboard/billing' },
    { label: 'Integrations', icon: '🔗', path: '/dashboard/integrations' },
  ]},
  { section: 'Account', items: [
    { label: 'Profile', icon: '👤', path: '/dashboard/profile' },
    { label: 'Security', icon: '🔒', path: '/dashboard/security' },
    { label: 'Notifications', icon: '🔔', path: '/dashboard/notifications' },
  ]},
]

const ACTIVITY = [
  { id: 'CLM-2241', action: 'Auto-approved', detail: 'Appendectomy · $21,400 · 97% confidence', time: '2 min ago', type: 'gn' },
  { id: 'CLM-2240', action: 'Pending review', detail: 'Spinal surgery · $42,500 · 68% confidence', time: '8 min ago', type: 'am' },
  { id: 'CLM-2239', action: 'Rejected — fraud', detail: 'Duplicate claim detected', time: '22 min ago', type: 'rd' },
  { id: 'CLM-2238', action: 'Approved by reviewer', detail: 'Auto accident · $8,800 · manual override', time: '1h ago', type: 'gn' },
  { id: 'CLM-2237', action: 'Auto-approved', detail: 'GP consultation · $820 · 99% confidence', time: '1h 15min ago', type: 'gn' },
]

function StatCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 22, marginRight: 4 }}>{icon}</span>
        <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--t)' }}>{value}</span>
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function AgentCard({ agent }: { agent: PlatformAgent }) {
  const navigate = useNavigate()
  const isOnline = agent.live_status === 'online'
  return (
    <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 24, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: 'var(--acd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🤖</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)' }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{agent.domain} · {agent.use_case.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              <span style={{ background: isOnline ? 'var(--gnd)' : 'var(--s3)', color: isOnline ? 'var(--gn)' : 'var(--t3)', borderRadius: 20, padding: '2px 8px' }}>
                {isOnline ? '● running' : '○ offline'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {isOnline && (
            <a href={`http://localhost:${agent.frontend_port}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-p">Open →</a>
          )}
          <button className="btn btn-sm" onClick={() => navigate(`/agents/${agent.id}`)}>Details</button>
        </div>
      </div>

      {/* Ports info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          ['API port', String(agent.api_port)],
          ['Frontend port', String(agent.frontend_port)],
          ['Status', agent.status],
          ['Version', `v${agent.version}`],
        ].map(([k, v]) => (
          <div key={k} style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {isOnline && (
          <>
            <a href={`http://localhost:${agent.frontend_port}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Open UI</a>
            <a href={`http://localhost:${agent.api_port}/docs`} target="_blank" rel="noopener noreferrer" className="btn btn-sm">API docs</a>
          </>
        )}
        <button className="btn btn-sm" onClick={() => navigate(`/connect/${agent.id}`)}>Configure</button>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<PlatformAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeLink, setActiveLink] = useState('/dashboard')

  useEffect(() => {
    fetchAgents().then(setAgents).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const online = agents.filter((a) => a.live_status === 'online').length

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--b)', background: 'var(--s)', padding: '16px 12px', display: 'flex', flexDirection: 'column' }}>
        {SIDEBAR_LINKS.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.1em', padding: '0 8px', marginBottom: 6 }}>{section}</div>
            {items.map((item) => (
              <button key={item.label} onClick={() => setActiveLink(item.path)}
                style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, background: activeLink === item.path ? 'var(--acd)' : 'transparent', color: activeLink === item.path ? 'var(--ac)' : 'var(--t2)', fontWeight: activeLink === item.path ? 600 : 400 }}>
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 32px', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)' }}>My workspace</h1>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Neural AI Agent platform</div>
          </div>
          <button className="btn btn-p" onClick={() => navigate('/browse')}>+ Add agent</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 28 }}>
          <StatCard icon="🤖" label="Active agents" value={String(online)} sub={`${agents.length} total registered`} />
          <StatCard icon="⚡" label="Platform status" value={online > 0 ? 'Online' : 'Offline'} sub="via /api/health" />
          <StatCard icon="📦" label="Agents found" value={String(agents.length)} sub="from agents/ folder" />
          <StatCard icon="🔗" label="API port" value="5001" sub="platform backend" />
        </div>

        {/* Agent cards */}
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Registered agents</h2>

        {loading && <div style={{ color: 'var(--t2)', padding: 40, textAlign: 'center' }}>Loading...</div>}

        {!loading && agents.length === 0 && (
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 40, textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 16 }}>No agents found. Start the platform backend first.</div>
            <button className="btn btn-p" onClick={() => navigate('/browse')}>Browse agents</button>
          </div>
        )}

        {agents.map((a) => <AgentCard key={a.id} agent={a} />)}

        {/* Recent activity */}
        {agents.length > 0 && (
          <>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 14, marginTop: 28 }}>Recent activity</h2>
            <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, overflow: 'hidden' }}>
              {ACTIVITY.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < ACTIVITY.length - 1 ? '1px solid var(--b)' : undefined }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${item.type})`, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac)', minWidth: 80 }}>{item.id}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{item.action}</span>
                    <span style={{ fontSize: 12, color: 'var(--t3)', marginLeft: 8 }}>{item.detail}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>{item.time}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
