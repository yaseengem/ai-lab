import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

const STEPS = ['Organisation', 'Connect systems', 'Configure rules', 'Review & activate']

const SYSTEMS = [
  { id: 'guidewire', name: 'Guidewire ClaimCenter', desc: 'Policy & claims system of record', required: true },
  { id: 'epic',     name: 'Epic EHR',              desc: 'Medical records access',           required: true },
  { id: 'inbox',    name: 'Document inbox',         desc: 'Email/fax intake channel',         required: true },
  { id: 'trizetto', name: 'TriZetto',               desc: 'Clearinghouse integration',        required: false },
  { id: 'slack',    name: 'Slack',                  desc: 'Team notifications',               required: false },
]

export function ConnectWorkspacePage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ org: '', email: '', volume: '100-500', plan: 'professional' })
  const [connected, setConnected] = useState<Set<string>>(new Set())
  const [thresholds, setThresholds] = useState({ auto: '500', review: '5000', confidence: '85', sla: '24' })
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🎉</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Agent activated!</h2>
        <p style={{ color: 'var(--t2)', marginBottom: 28 }}>{agentId} is now running and ready to process cases.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-p" onClick={() => navigate('/dashboard')}>Go to dashboard</button>
          <button className="btn" onClick={() => navigate('/browse')}>Browse more agents</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 40px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <div style={{ height: 1, width: 40, background: i <= step ? 'var(--ac)' : 'var(--b2)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: i < step ? 'pointer' : 'default' }} onClick={() => { if (i < step) setStep(i) }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: i < step ? 'var(--gn)' : i === step ? 'var(--ac)' : 'var(--s3)', color: i <= step ? '#fff' : 'var(--t3)', border: `1px solid ${i === step ? 'var(--ac)' : i < step ? 'var(--gn)' : 'var(--b2)'}` }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: i === step ? 600 : 400, color: i === step ? 'var(--t)' : 'var(--t3)' }}>{s}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 32 }}>

          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Organisation details</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Organisation name', key: 'org', type: 'text', placeholder: 'Acme Insurance Co.' },
                  { label: 'Work email', key: 'email', type: 'email', placeholder: 'you@company.com' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>{label}</label>
                    <input type={type} value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', display: 'block', marginBottom: 6 }}>Monthly claim volume</label>
                  <select value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)' }}>
                    {['< 100', '100-500', '500-2000', '2000+'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Connect your systems</h2>
              <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>Connect required systems to enable full automation. Optional systems add additional capabilities.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {SYSTEMS.map((sys) => (
                  <div key={sys.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', border: `1px solid ${connected.has(sys.id) ? 'var(--gn)' : 'var(--b)'}`, borderRadius: 10, background: connected.has(sys.id) ? 'var(--gnd)' : 'var(--s2)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>{sys.name} {sys.required && <span style={{ fontSize: 10, color: 'var(--rd)', marginLeft: 4 }}>required</span>}</div>
                      <div style={{ fontSize: 12, color: 'var(--t2)' }}>{sys.desc}</div>
                    </div>
                    <button className={`btn btn-sm ${connected.has(sys.id) ? '' : 'btn-p'}`}
                      style={connected.has(sys.id) ? { color: 'var(--gn)', borderColor: 'var(--gn)', background: 'transparent' } : {}}
                      onClick={() => setConnected((prev) => { const n = new Set(prev); n.has(sys.id) ? n.delete(sys.id) : n.add(sys.id); return n })}>
                      {connected.has(sys.id) ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Configure review rules</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Auto-approve below ($)', key: 'auto', help: 'Claims below this amount are auto-approved without review' },
                  { label: 'Mandatory review above ($)', key: 'review', help: 'Claims above this amount always require human sign-off' },
                  { label: 'Confidence threshold (%)', key: 'confidence', help: 'Minimum AI confidence score to proceed without review' },
                  { label: 'SLA window (hours)', key: 'sla', help: 'Time allowed for human reviewers to act before escalation' },
                ].map(({ label, key, help }) => (
                  <div key={key}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>{label}</label>
                    <input type="number" value={thresholds[key as keyof typeof thresholds]} onChange={(e) => setThresholds({ ...thresholds, [key]: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)', boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>{help}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--t)', marginBottom: 20 }}>Review & activate</h2>
              <div style={{ background: 'var(--gnd)', border: '1px solid var(--gn)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gn)', marginBottom: 12 }}>Configuration summary</div>
                {[
                  ['Agent', agentId],
                  ['Organisation', form.org || '—'],
                  ['Email', form.email || '—'],
                  ['Monthly volume', form.volume],
                  ['Connected systems', connected.size > 0 ? [...connected].join(', ') : 'None'],
                  ['Auto-approve below', `$${thresholds.auto}`],
                  ['Mandatory review above', `$${thresholds.review}`],
                  ['Confidence threshold', `${thresholds.confidence}%`],
                  ['SLA window', `${thresholds.sla}h`],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--t3)', minWidth: 180 }}>{k}</span>
                    <span style={{ color: 'var(--t)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 28, borderTop: '1px solid var(--b)', paddingTop: 20 }}>
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
            <button className="btn btn-sm" style={{ marginRight: 'auto' }}>Save draft</button>
            {step < STEPS.length - 1
              ? <button className="btn btn-p" onClick={() => setStep(step + 1)}>Continue →</button>
              : <button className="btn btn-p" onClick={() => setDone(true)}>🚀 Activate agent</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
