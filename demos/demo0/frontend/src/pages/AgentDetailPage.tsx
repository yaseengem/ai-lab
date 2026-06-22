import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchAgent,
  fetchAgentConfig,
  saveAgentConfig,
  restartAgent,
  type PlatformAgent,
} from '@/api/platform'

const DOMAIN_META: Record<string, { icon: string; bg: string }> = {
  insurance: { icon: '🏥', bg: 'var(--acd)' },
  healthcare: { icon: '🩺', bg: 'var(--gnd)' },
  banking:    { icon: '🏦', bg: 'var(--pud)' },
  realestate: { icon: '🏠', bg: 'var(--amd)' },
  legal:      { icon: '⚖️', bg: 'var(--tld)' },
  hr:         { icon: '👥', bg: 'var(--cod)' },
}

const TABS = ['Overview', 'Pricing', 'Integrations', 'Configuration']

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    online:  ['var(--gn)', 'var(--gnd)'],
    offline: ['var(--rd)', 'var(--rdd)'],
    unknown: ['var(--t3)', 'var(--s3)'],
  }
  const [c, bg] = map[status] ?? ['var(--t3)', 'var(--s3)']
  return <span style={{ background: bg, color: c, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>{status}</span>
}

/**
 * Configuration tab — loads the agent's agent.config.yaml as JSON, lets the user
 * edit it in a textarea, Save (PUT) it, and Restart the agent (POST).
 *
 * Config editing works even when the agent is offline (the backend reads/writes
 * the file straight from disk); only the restart behaviour differs by live status.
 */
function ConfigurationTab({ agent }: { agent: PlatformAgent }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // After a successful save, nudge the user to restart so changes take effect.
  const [needsRestart, setNeedsRestart] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadErr(null)
    fetchAgentConfig(agent.id)
      .then((cfg) => {
        if (!cancelled) setText(JSON.stringify(cfg, null, 2))
      })
      .catch((e) => {
        if (!cancelled) setLoadErr(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [agent.id])

  async function handleSave() {
    setMsg(null)
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      setMsg({ kind: 'err', text: 'Config is not valid JSON. Fix it before saving.' })
      return
    }
    setSaving(true)
    try {
      await saveAgentConfig(agent.id, parsed)
      setNeedsRestart(true)
      setMsg({ kind: 'ok', text: 'Configuration saved. Restart the agent to apply changes.' })
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  async function handleRestart() {
    setMsg(null)
    setRestarting(true)
    try {
      const res = await restartAgent(agent.id)
      setNeedsRestart(false)
      setMsg({
        kind: 'ok',
        text: res.running
          ? 'Agent is restarting to apply the new configuration.'
          : 'Agent was offline — starting it now with the saved configuration.',
      })
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Configuration</h2>
      <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 20, maxWidth: 620 }}>
        Edit this agent's <code>agent.config.yaml</code> (shown as JSON). Saving works
        whether or not the agent is running; restart the agent to apply the changes.
      </p>

      {loading && <div style={{ color: 'var(--t2)', padding: 20 }}>Loading configuration...</div>}

      {loadErr && (
        <div style={{ background: 'var(--rdd)', border: '1px solid var(--rd)', borderRadius: 10, padding: '14px 18px', color: 'var(--rd)', marginBottom: 16 }}>
          <strong>No configuration found</strong>
          <div style={{ fontSize: 12, marginTop: 6, color: 'var(--t2)' }}>{loadErr}</div>
        </div>
      )}

      {!loading && !loadErr && (
        <>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setMsg(null) }}
            spellCheck={false}
            style={{
              width: '100%', minHeight: 360, padding: '14px 16px', borderRadius: 10,
              border: '1px solid var(--b2)', background: 'var(--s)', color: 'var(--t)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5,
              lineHeight: 1.6, outline: 'none', resize: 'vertical',
            }}
          />

          {msg && (
            <div style={{
              marginTop: 14, padding: '12px 16px', borderRadius: 10, fontSize: 13,
              background: msg.kind === 'ok' ? 'var(--gnd)' : 'var(--rdd)',
              color: msg.kind === 'ok' ? 'var(--gn)' : 'var(--rd)',
              border: `1px solid ${msg.kind === 'ok' ? 'var(--gn)' : 'var(--rd)'}`,
            }}>
              {msg.text}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
            <button className="btn btn-p" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save configuration'}
            </button>
            <button
              className="btn"
              onClick={handleRestart}
              disabled={restarting}
              style={needsRestart ? { borderColor: 'var(--ac)', color: 'var(--ac)' } : undefined}
            >
              {restarting ? 'Restarting...' : 'Restart agent'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--t3)' }}>
              {agent.live_status === 'online'
                ? 'Agent is online — restart reloads its config.'
                : 'Agent is offline — restart starts it with the saved config.'}
            </span>
          </div>
        </>
      )}
    </div>
  )
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
              onClick={() => setTab(TABS.indexOf('Configuration'))}
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

        {tab === 3 && <ConfigurationTab agent={agent} />}
      </div>
    </div>
  )
}
