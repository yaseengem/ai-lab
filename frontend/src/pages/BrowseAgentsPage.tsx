import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAgents, type PlatformAgent } from '@/api/platform'

const DOMAIN_META: Record<string, { icon: string; tagCls: string; bg: string }> = {
  insurance: { icon: '🏥', tagCls: 'tb', bg: 'var(--acd)' },
  healthcare: { icon: '🩺', tagCls: 'tg', bg: 'var(--gnd)' },
  banking:    { icon: '🏦', tagCls: 'tp', bg: 'var(--pud)' },
  realestate: { icon: '🏠', tagCls: 'tam', bg: 'var(--amd)' },
  legal:      { icon: '⚖️', tagCls: 'tt', bg: 'var(--tld)' },
  hr:         { icon: '👥', tagCls: 'tco', bg: 'var(--cod)' },
  template:   { icon: '📦', tagCls: 'tgr', bg: 'var(--s3)' },
}

const STATUS_COLORS: Record<string, string> = {
  online:  'var(--gn)',
  offline: 'var(--rd)',
  unknown: 'var(--t3)',
}

function AgentCard({ agent, onClick }: { agent: PlatformAgent; onClick: () => void }) {
  const meta = DOMAIN_META[agent.domain] ?? { icon: '🤖', tagCls: 'tgr', bg: 'var(--s3)' }
  return (
    <div onClick={onClick}
      style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all .2s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.06)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 11 }}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{meta.icon}</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span className={`tag ${meta.tagCls}`}>{agent.domain}</span>
          <span style={{ fontSize: 11, color: STATUS_COLORS[agent.live_status] ?? 'var(--t3)' }}>
            {agent.live_status === 'online' ? '● online' : agent.live_status === 'offline' ? '● offline' : '○ unknown'}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 3 }}>{agent.name}</div>
      <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 8 }}>v{agent.version} · {agent.use_case.replace(/_/g, ' ')}</div>
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, marginBottom: 14 }}>{agent.description}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`tag ${agent.status === 'active' ? 'tg' : 'tgr'}`}>{agent.status}</span>
        <button className="btn btn-sm btn-p">View details →</button>
      </div>
    </div>
  )
}

export function BrowseAgentsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [agents, setAgents] = useState<PlatformAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [domain, setDomain] = useState(params.get('industry') ?? '')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = agents.filter((a) => {
    if (search && !`${a.name} ${a.description} ${a.use_case}`.toLowerCase().includes(search.toLowerCase())) return false
    if (domain && a.domain !== domain) return false
    if (statusFilter && a.status !== statusFilter) return false
    return true
  })

  const domains = [...new Set(agents.map((a) => a.domain))]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--b)', padding: '24px 16px', background: 'var(--s)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>Domain</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['', ...domains].map((d) => (
            <button key={d || '_all'} onClick={() => setDomain(d)}
              style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: domain === d ? 600 : 400, background: domain === d ? 'var(--acd)' : 'transparent', color: domain === d ? 'var(--ac)' : 'var(--t2)', transition: 'all .15s' }}>
              {d ? d.charAt(0).toUpperCase() + d.slice(1) : 'All domains'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, marginTop: 24 }}>Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['', 'active', 'stub'].map((s) => (
            <button key={s || '_all'} onClick={() => setStatusFilter(s)}
              style={{ textAlign: 'left', padding: '7px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: statusFilter === s ? 600 : 400, background: statusFilter === s ? 'var(--acd)' : 'transparent', color: statusFilter === s ? 'var(--ac)' : 'var(--t2)', transition: 'all .15s' }}>
              {s || 'All statuses'}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 32px' }}>
        {/* Search */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 28 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search agents..."
            style={{ flex: 1, maxWidth: 420, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)', outline: 'none' }} />
          <span style={{ fontSize: 13, color: 'var(--t3)' }}>{filtered.length} agent{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {loading && <div style={{ color: 'var(--t2)', padding: 40, textAlign: 'center' }}>Loading agents from platform...</div>}

        {error && (
          <div style={{ background: 'var(--rdd)', border: '1px solid var(--rd)', borderRadius: 10, padding: '16px 20px', color: 'var(--rd)', marginBottom: 24 }}>
            <strong>Could not reach platform backend</strong> — {error}
            <div style={{ fontSize: 12, marginTop: 6, color: 'var(--t2)' }}>Make sure the platform API is running at localhost:5001</div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: 'var(--t2)', textAlign: 'center', padding: 60 }}>
            No agents match your filters.
            {(search || domain || statusFilter) && <button className="btn btn-sm" style={{ marginLeft: 12 }} onClick={() => { setSearch(''); setDomain(''); setStatusFilter('') }}>Clear filters</button>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: 16 }}>
          {filtered.map((a) => (
            <AgentCard key={a.id} agent={a} onClick={() => navigate(`/agents/${a.id}`)} />
          ))}
        </div>
      </main>
    </div>
  )
}
