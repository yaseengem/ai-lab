import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession, uploadFile, streamChat } from '@/api/claims'

const STEPS = ['Claim details', 'Supporting documents', 'Review & submit']

export function SubmitClaimPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ member: 'John Doe', policy: 'POL-1001', provider: '', icd10: '', cpt: '', amount: '' })
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [caseId, setCaseId] = useState('')
  const [output, setOutput] = useState('')
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async () => {
    setSubmitting(true)
    setOutput('')
    try {
      const session = await createSession('end_user', form.member.toLowerCase().replace(/\s/g, '_'))
      setSessionId(session.session_id)
      let fileRefStr = ''
      if (files.length > 0) {
        const upload = await uploadFile(files[0], session.session_id)
        setCaseId(upload.case_id)
        fileRefStr = upload.file_ref
      }
      const message = `Submit new claim: Patient ${form.member}, Policy ${form.policy}, Provider: ${form.provider || 'Unknown'}, Diagnosis: ${form.icd10 || 'N/A'}, Procedure: ${form.cpt || 'N/A'}, Billed amount: $${form.amount || '0'}`
      for await (const event of streamChat(session.session_id, message, 'end_user', form.member, fileRefStr || undefined)) {
        if (event.type === 'text-delta') setOutput((p) => p + event.content)
        if (event.type === 'done') { setDone(true); break }
      }
    } catch (e: unknown) {
      setOutput(`Error: ${(e as Error).message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Claim submitted</h2>
        <div style={{ background: 'var(--s2)', borderRadius: 10, padding: 16, fontSize: 12, color: 'var(--t2)', textAlign: 'left', marginBottom: 20, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{output}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-p" onClick={() => navigate(`/status/${sessionId}`)}>Track claim →</button>
          <button className="btn" onClick={() => navigate('/queue')}>View queue</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 40px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>Submit a claim</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 28 }}>The Claim Processing Agent will review your claim automatically.</p>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <div style={{ height: 1, width: 48, background: i <= step ? 'var(--ac)' : 'var(--b2)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: i < step ? 'var(--gn)' : i === step ? 'var(--ac)' : 'var(--s3)', color: i <= step ? '#fff' : 'var(--t3)' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: i === step ? 600 : 400, color: i === step ? 'var(--t)' : 'var(--t3)' }}>{s}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 28 }}>
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Claim details</h2>
              {/* Member info banner */}
              <div style={{ background: 'var(--acd)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 24, fontSize: 13 }}>
                <div><span style={{ color: 'var(--t3)' }}>Member: </span><strong style={{ color: 'var(--t)' }}>{form.member}</strong></div>
                <div><span style={{ color: 'var(--t3)' }}>Policy: </span><strong style={{ color: 'var(--t)' }}>{form.policy}</strong></div>
              </div>
              {[
                { label: 'Provider name', key: 'provider', placeholder: 'ABC Medical Center' },
                { label: 'ICD-10 diagnosis code', key: 'icd10', placeholder: 'e.g. K35.89 — Acute appendicitis' },
                { label: 'CPT procedure code', key: 'cpt', placeholder: 'e.g. 44950 — Appendectomy' },
                { label: 'Total billed amount ($)', key: 'amount', placeholder: '21400' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>{label}</label>
                  <input value={form[key as keyof typeof form]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s)', color: 'var(--t)', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 16 }}>Supporting documents</h2>
              <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed var(--b2)', borderRadius: 12, padding: 36, textAlign: 'center', cursor: 'pointer', background: 'var(--s2)' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--t)' }}>Drop files here or click to upload</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>PDF, images, DOCX — max 20 MB</div>
                <input ref={fileRef} type="file" style={{ display: 'none' }} multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.txt" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              </div>
              {files.length > 0 && (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {files.map((f) => (
                    <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--gnd)', borderRadius: 8 }}>
                      <span style={{ fontSize: 16 }}>📄</span>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--t)' }}>{f.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--t3)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                      <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--rd)', fontSize: 16 }} onClick={() => setFiles((p) => p.filter((x) => x !== f))}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 16 }}>Review & submit</h2>
              <div style={{ background: 'var(--s2)', borderRadius: 10, padding: 18, marginBottom: 20 }}>
                {[['Member', form.member], ['Policy', form.policy], ['Provider', form.provider || '—'], ['ICD-10', form.icd10 || '—'], ['CPT', form.cpt || '—'], ['Billed amount', form.amount ? `$${form.amount}` : '—'], ['Documents', files.length > 0 ? files.map((f) => f.name).join(', ') : 'None']].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', gap: 12, fontSize: 13, marginBottom: 8 }}>
                    <span style={{ color: 'var(--t3)', minWidth: 120 }}>{k}</span>
                    <span style={{ color: 'var(--t)', fontWeight: 500 }}>{v}</span>
                  </div>
                ))}
              </div>
              {submitting && (
                <div style={{ background: 'var(--acd)', borderRadius: 10, padding: 14, fontSize: 13, color: 'var(--ac)', marginBottom: 16 }}>
                  🤖 Claim Processing Agent is processing your claim...
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t2)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>{output}</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--b)' }}>
            {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>← Back</button>}
            <button className="btn btn-sm" style={{ marginRight: 'auto' }}>Save draft</button>
            {step < STEPS.length - 1
              ? <button className="btn btn-p" onClick={() => setStep(step + 1)}>Continue →</button>
              : <button className="btn btn-p" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Processing...' : '🚀 Submit claim'}</button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}
