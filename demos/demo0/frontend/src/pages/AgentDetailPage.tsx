import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchAgent, type PlatformAgent } from '@/api/platform'

const DOMAIN_META: Record<string, { icon: string; bg: string }> = {
  insurance: { icon: '🏥', bg: 'var(--acd)' },
  healthcare: { icon: '🩺', bg: 'var(--gnd)' },
  banking:    { icon: '🏦', bg: 'var(--pud)' },
  realestate: { icon: '🏠', bg: 'var(--amd)' },
  legal:      { icon: '⚖️', bg: 'var(--tld)' },
  hr:         { icon: '👥', bg: 'var(--cod)' },
}

const TABS = ['Overview', 'Pricing', 'Integrations']

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    online:  ['var(--gn)', 'var(--gnd)'],
    offline: ['var(--rd)', 'var(--rdd)'],
    unknown: ['var(--t3)', 'var(--s3)'],
  }
  const [c, bg] = map[status] ?? ['var(--t3)', 'var(--s3)']
  return <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>{status}</span>
}

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<PlatformAgent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState(0)

  useEffect(() => {
    if (!agentId) return
    fetchAgent(agentId)
      .then(setAgent)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [agentId])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--t2)' }}>Loading...</div>
  if (error || !agent) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <div style={{ color: 'var(--rd)', marginBottom: 16 }}>{error ?? 'Agent not found'}</div>
      <button className="btn" onClick={() => navigate('/browse')}>← Back to browse</button>
    </div>
  )

  const meta = DOMAIN_META[agent.domain] ?? { icon: '🤖', bg: 'var(--s3)' }

  return (
    <div style={{ background: 'var(--bg)' }}>

      {/* Hero band */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '32px 40px' }}>
        <button className="btn btn-sm" onClick={() => navigate('/browse')} style={{ marginBottom: 20 }}>← Browse agents</button>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div style={{ width: 72, height: 72, borderRadius: 16, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, flexShrink: 0 }}>{meta.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--t)', letterSpacing: '-.5px' }}>{agent.name}</h1>
              <StatusBadge status={agent.live_status} />
              <span className={`tag ${agent.status === 'active' ? 'tg' : 'tgr'}`}>{agent.status}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 10 }}>
              {agent.domain} · {agent.use_case.replace(/_/g, ' ')} · v{agent.version}
            </div>
            <p style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.7, maxWidth: 620 }}>{agent.description}</p>
            <div style={{ display: 'flex', gap: 20, marginTop: 16, fontSize: 12, color: 'var(--t3)' }}>
              <span>API: <strong style={{ color: 'var(--t2)' }}>localhost:{agent.api_port}</strong></span>
              <span>Frontend: <strong style={{ color: 'var(--t2)' }}>localhost:{agent.frontend_port}</strong></span>
              <span>Agent ID: <strong style={{ color: 'var(--t2)' }}>{agent.id}</strong></span>
            </div>
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agent.live_status === 'online' ? (
              <a href={`http://localhost:${agent.frontend_port}`} target="_blank" rel="noopener noreferrer" className="btn btn-p">Go to Agent Operations →</a>
            ) : (
              <button className="btn btn-p" onClick={() => navigate(`/connect/${agent.id}`)}>Launch Agent</button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => navigate(`/configure/${agent.id}`)}
              disabled={agent.live_status !== 'online'}
            >Configure agent</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--b)', background: 'var(--s)', padding: '0 40px', display: 'flex', gap: 4 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ padding: '12px 18px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === i ? 600 : 400, color: tab === i ? 'var(--ac)' : 'var(--t2)', borderBottom: tab === i ? '2px solid var(--ac)' : '2px solid transparent', transition: 'all .15s' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '32px 40px', maxWidth: 900 }}>
        {tab === 0 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Overview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                ['🔍', 'Document Intake', 'Upload and parse PDFs, images, and documents automatically'],
                ['🧠', 'AI Analysis', 'Multi-agent reasoning with Claude Sonnet on Amazon Bedrock'],
                ['✅', 'Validation Engine', 'Cross-reference extracted data against policy rules'],
                ['🚨', 'Fraud Detection', 'Pattern analysis against historical fraud indicators'],
                ['👁️', 'Human-in-the-Loop', 'Configurable approval thresholds with email notifications'],
                ['📊', 'Audit Logging', 'Complete traceable record of every decision and action'],
                ['🔗', 'API-first', 'REST endpoints + SSE streaming for real-time updates'],
                ['📁', 'File Storage', 'Secure per-case document and data storage'],
              ].map(([icon, title, desc]) => (
                <div key={title as string} style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 1 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Pricing</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {[
                { name: 'Starter', price: '$99/mo', features: ['Up to 500 claims/mo', 'Basic audit log', 'Email support', 'API access'] },
                { name: 'Professional', price: '$199/mo', features: ['Up to 2,000 claims/mo', 'Full audit trail', 'Human-in-the-loop', 'Priority support', 'Custom thresholds'], highlight: true },
                { name: 'Enterprise', price: 'Custom', features: ['Unlimited volume', 'Dedicated instance', 'SLA guarantee', 'Custom integrations', 'On-call support'] },
              ].map((plan) => (
                <div key={plan.name} style={{ background: plan.highlight ? 'var(--ac)' : 'var(--s)', border: `1px solid ${plan.highlight ? 'var(--ac)' : 'var(--b)'}`, borderRadius: 14, padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: plan.highlight ? '#fff' : 'var(--t)', marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: plan.highlight ? '#fff' : 'var(--t)', marginBottom: 16 }}>{plan.price}</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {plan.features.map((f) => (
                      <li key={f} style={{ fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.9)' : 'var(--t2)', display: 'flex', gap: 6 }}>
                        <span style={{ color: plan.highlight ? '#fff' : 'var(--gn)' }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  <button className={`btn ${plan.highlight ? '' : 'btn-p'}`} style={{ marginTop: 20, width: '100%', background: plan.highlight ? '#fff' : undefined, color: plan.highlight ? 'var(--ac)' : undefined }}>
                    Get started
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 2 && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Integrations</h2>
            {[
              ['Core systems', ['Guidewire ClaimCenter', 'Epic EHR', 'Salesforce', 'SAP']],
              ['Document processing', ['Amazon S3', 'SharePoint', 'DocuSign', 'Adobe PDF']],
              ['Notifications', ['Slack', 'Microsoft Teams', 'Email (SMTP)', 'PagerDuty']],
              ['Compliance', ['HIPAA', 'SOC 2', 'ISO 27001', 'State DOI reporting']],
            ].map(([cat, items]) => (
              <div key={cat as string} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>{cat}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(items as string[]).map((item) => <span key={item} className="tag tgr">{item}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
