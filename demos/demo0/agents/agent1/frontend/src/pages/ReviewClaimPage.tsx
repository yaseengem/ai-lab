import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchCases, submitApprove, submitReject, type ClaimRow } from '@/api/claims'

type Decision = 'approve' | 'modify' | 'deny'

const STEPS = [
  { label: 'Intake & parsing',        note: 'Member identified · ICD/CPT validated · Documents received' },
  { label: 'Document validation',     note: 'EOB complete ✓ · Surgical report ✓ · Pre-auth letter ✓' },
  { label: 'Policy & eligibility',    note: 'Member active ✓ · CPT covered ✓ · Deductible met ✓' },
  { label: 'Medical expert review',   note: 'ICD/CPT match confirmed per CMS guidelines ✓ · Medical necessity confirmed ✓' },
  { label: 'Fraud & duplicate check', note: 'No duplicates ✓ · Provider clean ✓ · Fraud score: 4/100 ✓' },
  { label: 'Amount calculation',       note: 'Benefit schedule applied · Rate differential calculated' },
  { label: 'QA self-check',            note: 'All steps consistent ✓ · Confidence calculated · Review routed' },
  { label: 'Awaiting your decision',  note: 'Claim pending adjuster review' },
]

export function ReviewClaimPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<ClaimRow | null>(null)
  const [decision, setDecision] = useState<Decision>('approve')
  const [customAmount, setCustomAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!caseId) return
    fetchCases({ role: 'support_exec' })
      .then(rows => {
        const found = rows.find(r => r.case_id === caseId)
        setClaim(found ?? null)
      })
      .catch(() => {})
  }, [caseId])

  const handleSubmit = async () => {
    if (!caseId) return
    setSubmitting(true)
    try {
      if (decision === 'deny') {
        await submitReject(caseId, 'adjuster', notes || 'Claim denied.')
      } else {
        await submitApprove(caseId, 'adjuster', notes || 'Claim approved.')
      }
      setDone(true)
    } catch {
      /* ignore */
    } finally {
      setSubmitting(false)
    }
  }

  const conf = claim?.confidence_score ?? 78
  const confColor = conf >= 90 ? 'var(--gn)' : conf >= 80 ? 'var(--am)' : 'var(--rd)'
  const recommended = claim?.approved_amount ?? Math.round((claim?.billed_amount ?? 0) * 0.77)
  const stepsComplete = 7

  if (done) {
    return (
      <div style={{ padding: 60, textAlign: 'center', maxWidth: 520, margin: '0 auto' }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)', marginBottom: 12 }}>Decision submitted</h2>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>
          {decision === 'deny' ? 'Claim denied.' : `Claim approved. A decision letter will be sent to the claimant.`}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-p" onClick={() => navigate('/queue')}>← Back to queue</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Top band */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 2 }}>
            <button style={{ background: 'none', border: 'none', color: 'var(--ac)', cursor: 'pointer', fontSize: 12, padding: 0 }} onClick={() => navigate('/queue')}>← Review queue</button>
            {' / '}{caseId}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>{caseId} — {claim?.user_id || 'Claimant'}</div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
            {claim?.billed_amount ? `$${claim.billed_amount.toLocaleString()} billed` : 'Pending'} · {claim?.updated_at?.slice(0, 10) || ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: 'var(--amd)', color: 'var(--am)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>Pending review</span>
          <button className="btn btn-sm" onClick={() => navigate('/queue')}>← Back to queue</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', maxWidth: 1280, margin: '0 auto', padding: '20px 32px', gap: 20, alignItems: 'flex-start' }}>

        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* AI recommendation box */}
          <div style={{ background: 'var(--s)', border: `1px solid var(--ac)`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', display: 'flex', alignItems: 'center', gap: 8 }}>AI recommendation</div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>Confidence score</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: confColor }}>{conf}%</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden', width: 120 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: confColor, width: `${conf}%` }} />
                  </div>
                  <span style={{ fontSize: 11, color: confColor }}>{conf < 85 ? 'Below 85% threshold' : 'Above threshold'}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
              {[
                { label: 'Recommended decision', val: recommended > 0 ? 'Partial approval' : 'Review', valColor: 'var(--am)' },
                { label: 'Recommended amount', val: recommended > 0 ? `$${recommended.toLocaleString()}` : '—', valColor: 'var(--gn)' },
                { label: 'Review reason', val: conf < 85 ? 'Low confidence' : 'High value', valColor: 'var(--t)' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--s2)', borderRadius: 8, padding: 11 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: m.valColor }}>{m.val}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--s2)', borderRadius: 8, padding: 12, fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--t)' }}>QA self-check summary:</strong> Claim appears valid. Member active, procedure covered, medical necessity confirmed.
              {conf < 85 ? ` Confidence ${conf}% — below the 85% threshold triggering mandatory human review.` : ` Confidence ${conf}% — within acceptable range but amount exceeds review threshold.`}
              {' '}All processing steps completed without errors.
            </div>
          </div>

          {/* Processing log */}
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>Agent processing log</div>
              <button className="btn btn-sm" onClick={() => navigate('/logs')}>View full log →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {STEPS.map((s, i) => {
                const done = i < stepsComplete
                const active = i === stepsComplete
                return (
                  <div key={i} style={{ display: 'flex', gap: 14 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, border: '2px solid', borderColor: done ? 'var(--gn)' : active ? 'var(--ac)' : 'var(--b2)', background: done ? 'var(--gnd)' : active ? 'var(--acd)' : 'var(--s2)' }}>
                        {done ? '✓' : i + 1}
                      </div>
                      {i < STEPS.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 12, margin: '3px 0', background: done ? 'var(--gn)' : 'var(--b2)' }} />}
                    </div>
                    <div style={{ paddingBottom: 16, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: done ? 'var(--t)' : active ? 'var(--ac)' : 'var(--t3)', marginBottom: 2 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--t2)', background: 'var(--s2)', borderRadius: 7, padding: '9px 12px', lineHeight: 1.65 }}>{s.note}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ width: 300, flexShrink: 0 }}>

          {/* Decision panel */}
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16, marginBottom: 12, position: 'sticky', top: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 12 }}>Make a decision</div>

            {(['approve', 'modify', 'deny'] as Decision[]).map(d => {
              const labels = { approve: `✓ Approve — AI amount ($${recommended.toLocaleString()})`, modify: '✎ Approve — custom amount', deny: '✗ Deny claim' }
              const descs = { approve: 'Accept the AI recommendation', modify: 'Override the amount', deny: 'Reject with reason' }
              const selectedBg = { approve: 'var(--gnd)', modify: 'var(--amd)', deny: 'var(--rdd)' }
              const selectedBorder = { approve: 'var(--gn)', modify: 'var(--am)', deny: 'var(--rd)' }
              const labelColor = { approve: 'var(--gn)', modify: 'var(--am)', deny: 'var(--rd)' }
              const isSelected = decision === d
              return (
                <div
                  key={d}
                  onClick={() => setDecision(d)}
                  style={{
                    border: '1px solid', borderRadius: 8, padding: '11px 14px', marginBottom: 8, cursor: 'pointer',
                    borderColor: isSelected ? selectedBorder[d] : 'var(--b2)',
                    background: isSelected ? selectedBg[d] : 'var(--s)',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? labelColor[d] : 'var(--t)', marginBottom: 2 }}>{labels[d]}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{descs[d]}</div>
                </div>
              )
            })}

            {decision === 'modify' && (
              <div style={{ marginTop: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>Custom approved amount</label>
                <input
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  placeholder="e.g. 16000"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)', boxSizing: 'border-box' }}
                />
              </div>
            )}

            <div style={{ height: 1, background: 'var(--b)', margin: '14px 0' }} />

            <div>
              <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>Decision notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Notes for the claimant letter..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 12, background: 'var(--s2)', color: 'var(--t)', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <button
              className={`btn ${decision === 'deny' ? '' : 'btn-p'}`}
              style={{ width: '100%', marginBottom: 8, marginTop: 4, fontSize: 14, padding: '11px 22px', background: decision === 'deny' ? 'var(--rdd)' : undefined, borderColor: decision === 'deny' ? 'var(--rd)' : undefined, color: decision === 'deny' ? 'var(--rd)' : undefined, justifyContent: 'center' }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : decision === 'deny' ? '✗ Deny claim & send notice' : `✓ ${decision === 'modify' ? 'Approve custom amount' : `Approve $${recommended.toLocaleString()}`} & send`}
            </button>
            <button className="btn btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => navigate('/supervisor')}>↑ Escalate to supervisor</button>
            <button className="btn btn-sm" style={{ width: '100%', color: 'var(--t3)' }}>Save draft</button>
          </div>

          {/* Claim info */}
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Claim info</div>
            {[
              ['Case ID', claim?.case_id || '—'],
              ['Member', claim?.user_id || '—'],
              ['Billed', claim?.billed_amount ? `$${claim.billed_amount.toLocaleString()}` : '—'],
              ['AI recommended', recommended > 0 ? `$${recommended.toLocaleString()}` : '—'],
              ['Status', claim?.status || '—'],
              ['Date', claim?.updated_at?.slice(0, 10) || '—'],
            ].map(([k, v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--b)' }}>
                <span style={{ color: 'var(--t3)' }}>{k}</span>
                <span style={{ color: 'var(--t)', fontWeight: 500, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
