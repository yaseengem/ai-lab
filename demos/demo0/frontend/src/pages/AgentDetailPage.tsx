import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchAgent,
  fetchAgentConfig,
  saveAgentConfig,
  restartAgent,
  type PlatformAgent,
  type AgentConfigDoc,
  type Integration,
} from '@/api/platform'

const DOMAIN_META: Record<string, { icon: string; bg: string }> = {
  insurance: { icon: '🏥', bg: 'var(--acd)' },
  healthcare: { icon: '🩺', bg: 'var(--gnd)' },
  banking:    { icon: '🏦', bg: 'var(--pud)' },
  realestate: { icon: '🏠', bg: 'var(--amd)' },
  legal:      { icon: '⚖️', bg: 'var(--tld)' },
  hr:         { icon: '👥', bg: 'var(--cod)' },
}

const TABS = ['Overview', 'Integrations', 'Configuration']

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
 * Configuration tab — loads the agent's agent.config.yaml and exposes the
 * operator-relevant fields as a GUI form (no raw JSON): model, human-in-the-loop
 * toggle, and connected systems. Untouched config keys (personas, capabilities)
 * are preserved on save.
 *
 * Config editing works even when the agent is offline (the backend reads/writes
 * the file straight from disk); only the restart behaviour differs by live status.
 */

// Known Bedrock model ids offered in the Model dropdown. A blank value inherits
// the platform default (BEDROCK_MODEL_ID, then the root config.yaml default).
const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Inherit platform default' },
  { value: 'us.anthropic.claude-sonnet-4-20250514-v1:0', label: 'Claude Sonnet 4 (Bedrock)' },
]

// Seed personas used when an agent has no agent.config.yaml yet — the backend
// requires a personas array to save. Personas aren't edited here; this just lets
// an unconfigured agent be saved from the form.
const SCAFFOLD_DOC: AgentConfigDoc = {
  personas: [
    { id: 'admin', label: 'Administrator', icon: '⚙️', description: '', visible_pages: ['chat', 'config'], default_landing: 'chat' },
  ],
  defaults: { model_id: '' },
  features: { hitl_approval: true },
  integrations: [],
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? 'var(--ac)' : 'var(--b2)', position: 'relative', transition: 'background .15s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      }} />
    </button>
  )
}

function ConfigurationTab({ agent }: { agent: PlatformAgent }) {
  // The full config doc as loaded — source of truth for keys we don't edit here.
  const [baseDoc, setBaseDoc] = useState<AgentConfigDoc | null>(null)
  const [modelId, setModelId] = useState('')
  const [hitl, setHitl] = useState(true)
  const [integrations, setIntegrations] = useState<Integration[]>([])

  const [loading, setLoading] = useState(true)
  // No agent.config.yaml on disk yet — show a friendly "configure" prompt.
  const [notConfigured, setNotConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // After a successful save, nudge the user to restart so changes take effect.
  const [needsRestart, setNeedsRestart] = useState(false)

  // Pull the editable fields out of a loaded (or scaffold) config doc.
  function hydrate(cfg: AgentConfigDoc) {
    setBaseDoc(cfg)
    setModelId(String((cfg.defaults as Record<string, unknown>)?.model_id ?? ''))
    setHitl(Boolean((cfg.features as Record<string, unknown>)?.hitl_approval ?? false))
    setIntegrations(Array.isArray(cfg.integrations) ? cfg.integrations : [])
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAgentConfig(agent.id)
      .then((cfg) => {
        if (!cancelled) { hydrate(cfg); setNotConfigured(false) }
      })
      .catch(() => {
        // The expected failure is a missing config (404) — treat it as "not
        // configured" and seed the form so it can be saved into existence.
        if (!cancelled) { hydrate(SCAFFOLD_DOC); setNotConfigured(true) }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [agent.id])

  // A model id loaded from config that isn't in our known list still needs an option.
  const modelOptions =
    modelId && !MODEL_OPTIONS.some((o) => o.value === modelId)
      ? [...MODEL_OPTIONS, { value: modelId, label: modelId }]
      : MODEL_OPTIONS

  function toggleConnection(id: string) {
    setMsg(null)
    setIntegrations((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = !it.connected
        // Functional path: a real auth_url opens the provider's OAuth page.
        if (next && it.auth_url) window.open(it.auth_url, '_blank', 'noopener,noreferrer')
        return { ...it, connected: next }
      }),
    )
  }

  async function handleSave() {
    if (!baseDoc) return
    setMsg(null)
    // Merge edited fields back into the full doc so personas/capabilities survive.
    const merged: AgentConfigDoc = {
      ...baseDoc,
      defaults: { ...(baseDoc.defaults ?? {}), model_id: modelId },
      features: { ...(baseDoc.features ?? {}), hitl_approval: hitl },
      integrations,
    }
    setSaving(true)
    try {
      await saveAgentConfig(agent.id, merged)
      setBaseDoc(merged)
      setNeedsRestart(true)
      setNotConfigured(false)
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

  const labelStyle = { fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 6, display: 'block' } as const
  const helpStyle = { fontSize: 12, color: 'var(--t3)', marginTop: 6 } as const
  const cardStyle = { background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: '18px 20px', marginBottom: 16 } as const

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Configuration</h2>
      <p style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 20, maxWidth: 620 }}>
        Edit this agent's settings. Saving works whether or not the agent is running;
        restart the agent to apply the changes.
      </p>

      {loading && <div style={{ color: 'var(--t2)', padding: 20 }}>Loading configuration...</div>}

      {!loading && notConfigured && (
        <div style={{ background: 'var(--acd)', border: '1px solid var(--ac)', borderRadius: 10, padding: '14px 18px', color: 'var(--ac)', marginBottom: 16 }}>
          <strong>Configure this agent</strong>
          <div style={{ fontSize: 12, marginTop: 6, color: 'var(--t2)' }}>
            This agent isn't configured yet. Set the fields below and Save to configure it, then restart the agent.
          </div>
        </div>
      )}

      {!loading && baseDoc && (
        <>
          {/* Model */}
          <div style={cardStyle}>
            <label style={labelStyle}>Model</label>
            <select
              value={modelId}
              onChange={(e) => { setModelId(e.target.value); setMsg(null) }}
              style={{ width: '100%', maxWidth: 420, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)' }}
            >
              {modelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div style={helpStyle}>The Bedrock model this agent runs on. Inherit uses the platform default.</div>
          </div>

          {/* Human-in-the-loop */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <label style={labelStyle}>Human-in-the-loop approval</label>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Pause runs at an approval gate before any irreversible action.</div>
              </div>
              <Toggle on={hitl} onChange={(v) => { setHitl(v); setMsg(null) }} />
            </div>
          </div>

          {/* Connected systems */}
          <div style={cardStyle}>
            <label style={labelStyle}>Connected systems</label>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
              External systems this agent connects to. Connecting an OAuth system opens its sign-in page.
            </div>
            {integrations.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>No systems declared for this agent.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {integrations.map((it) => (
                  <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', border: `1px solid ${it.connected ? 'var(--gn)' : 'var(--b)'}`, borderRadius: 10, background: it.connected ? 'var(--gnd)' : 'var(--s2)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
                        {it.name}
                        {it.category && <span style={{ fontSize: 10, color: 'var(--t3)', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>{it.category}</span>}
                      </div>
                      {it.description && <div style={{ fontSize: 12, color: 'var(--t2)' }}>{it.description}</div>}
                    </div>
                    <button
                      className={`btn btn-sm ${it.connected ? '' : 'btn-p'}`}
                      style={it.connected ? { color: 'var(--gn)', borderColor: 'var(--gn)', background: 'transparent' } : {}}
                      onClick={() => toggleConnection(it.id)}
                    >
                      {it.connected ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

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
      .then((a) => {
        setAgent(a)
        // An unconfigured agent lands straight on Configuration so the user can set it up.
        if (a.configured === false) setTab(TABS.indexOf('Configuration'))
      })
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
            <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Integrations</h2>
            {[
              ['Productivity & collaboration', ['M365', 'Outlook', 'Teams', 'SharePoint', 'Email', 'Slack']],
              ['Business platforms', ['Salesforce', 'ServiceNow', 'SAP', 'Oracle HRMS', 'Workday']],
              ['Cloud', ['AWS', 'Azure', 'GCP']],
              ['AWS services', ['AWS SES', 'AWS SNS']],
              ['Data & documents', ['AWS S3', 'SQL Database', 'PDF', 'REST API / Webhooks']],
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

        {tab === 2 && <ConfigurationTab agent={agent} />}
      </div>
    </div>
  )
}
