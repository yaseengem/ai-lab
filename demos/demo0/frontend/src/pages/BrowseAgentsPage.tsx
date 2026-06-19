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

function FilterGroup({
  label, options, selected, onChange,
}: {
  label: string
  options: string[]
  selected: Set<string>
  onChange: (v: Set<string>) => void
}) {
  function toggle(opt: string) {
    const next = new Set(selected)
    if (next.has(opt)) next.delete(opt)
    else next.add(opt)
    onChange(next)
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</span>
        {selected.size > 0 && (
          <button onClick={() => onChange(new Set())}
            style={{ fontSize: 10, color: 'var(--ac)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            clear
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {options.map((opt) => {
          const checked = selected.has(opt)
          return (
            <button key={opt} onClick={() => toggle(opt)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, background: checked ? 'var(--acd)' : 'transparent', color: checked ? 'var(--ac)' : 'var(--t2)', transition: 'all .15s' }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${checked ? 'var(--ac)' : 'var(--b2)'}`, background: checked ? 'var(--ac)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                {checked && <span style={{ color: '#fff', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>}
              </span>
              <span style={{ fontWeight: checked ? 600 : 400 }}>{opt.replace(/_/g, ' ')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
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
  const [domainFilter, setDomainFilter] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => {
    const s = params.get('status')
    return s ? new Set([s]) : new Set()
  })
  const [liveStatusFilter, setLiveStatusFilter] = useState<Set<string>>(new Set())
  const [useCaseFilter, setUseCaseFilter] = useState<Set<string>>(new Set())
  const [versionFilter, setVersionFilter] = useState<Set<string>>(new Set())

  useEffect(() => {
    const s = params.get('status')
    setStatusFilter(s ? new Set([s]) : new Set())
    const d = params.get('domain')
    setDomainFilter(d ? new Set([d]) : new Set())
  }, [params])

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = agents.filter((a) => {
    if (search && !`${a.name} ${a.description} ${a.use_case}`.toLowerCase().includes(search.toLowerCase())) return false
    if (domainFilter.size > 0 && !domainFilter.has(a.domain)) return false
    if (statusFilter.size > 0 && !statusFilter.has(a.status)) return false
    if (liveStatusFilter.size > 0 && !liveStatusFilter.has(a.live_status)) return false
    if (useCaseFilter.size > 0 && !useCaseFilter.has(a.use_case)) return false
    if (versionFilter.size > 0 && !versionFilter.has(a.version)) return false
    return true
  })

  const anyFilter = !!(search || domainFilter.size || statusFilter.size || liveStatusFilter.size || useCaseFilter.size || versionFilter.size)
  const clearAll = () => {
    setSearch('')
    setDomainFilter(new Set())
    setStatusFilter(new Set())
    setLiveStatusFilter(new Set())
    setUseCaseFilter(new Set())
    setVersionFilter(new Set())
  }

  const domainOptions   = [...new Set(agents.map((a) => a.domain))]
  const useCaseOptions  = [...new Set(agents.map((a) => a.use_case))]
  const versionOptions  = [...new Set(agents.map((a) => a.version))].sort()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Sidebar */}
      <aside style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--b)', padding: '24px 16px', background: 'var(--s)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Filters</span>
          {anyFilter && (
            <button onClick={clearAll} style={{ fontSize: 11, color: 'var(--ac)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              Clear all
            </button>
          )}
        </div>

        <FilterGroup label="Domain"      options={domainOptions}  selected={domainFilter}      onChange={setDomainFilter} />
        <FilterGroup label="Status"      options={['active', 'stub']} selected={statusFilter}  onChange={setStatusFilter} />
        <FilterGroup label="Live status" options={['online', 'offline', 'unknown']} selected={liveStatusFilter} onChange={setLiveStatusFilter} />
        <FilterGroup label="Use case"    options={useCaseOptions} selected={useCaseFilter}     onChange={setUseCaseFilter} />
        <FilterGroup label="Version"     options={versionOptions} selected={versionFilter}     onChange={setVersionFilter} />
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '28px 32px' }}>
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
            {anyFilter && <button className="btn btn-sm" style={{ marginLeft: 12 }} onClick={clearAll}>Clear filters</button>}
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
