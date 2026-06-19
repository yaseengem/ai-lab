import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchSessionStatus, fetchCases, type ClaimRow } from '@/api/claims'

const STATUS_STEPS = [
  'Intake complete',
  'Documents extracted',
  'Validation passed',
  'Medical review',
  'Fraud check',
  'Adjudication',
  'Decision',
]

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending_approval:    { label: 'Pending review', color: 'var(--am)', bg: 'var(--amd)' },
  approved_for_comm:   { label: 'Approved', color: 'var(--gn)', bg: 'var(--gnd)' },
  rejected:            { label: 'Denied', color: 'var(--rd)', bg: 'var(--rdd)' },
  communicated:        { label: 'Closed', color: 'var(--t3)', bg: 'var(--s3)' },
  validation_failed:   { label: 'Rejected', color: 'var(--rd)', bg: 'var(--rdd)' },
}

function getStatusMeta(status: string) {
  return STATUS_MAP[status] ?? { label: 'Processing', color: 'var(--ac)', bg: 'var(--acd)' }
}

function getStepsDone(status: string): number {
  const map: Record<string, number> = {
    intake_complete: 1, extraction_complete: 2, validated: 3,
    medical_reviewed: 4, fraud_checked: 5, adjudicated: 6,
    pending_approval: 6, approved_for_comm: 7, rejected: 7,
    communicated: 7, overridden: 7,
  }
  return map[status] ?? 0
}

export function ClaimStatusPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<{ session_id: string; case_id: string; status: string } | null>(null)
  const [cases, setCases] = useState<ClaimRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        if (sessionId) {
          const s = await fetchSessionStatus(sessionId)
          setClaim(s)
        }
        const rows = await fetchCases({ role: 'end_user' })
        setCases(rows.slice(0, 5))
      } catch (e: unknown) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [sessionId])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--t2)' }}>Loading...</div>

  const activeStatus = claim?.status ?? 'PROCESSING'
  const meta = getStatusMeta(activeStatus)
  const stepsDone = getStepsDone(activeStatus)

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '32px 40px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 24 }}>

        {/* Main content */}
        <div style={{ flex: 1 }}>
          <button className="btn btn-sm" onClick={() => navigate('/')} style={{ marginBottom: 20 }}>← Home</button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t)', marginBottom: 20 }}>Claim status</h1>

          {error && (
            <div style={{ background: 'var(--rdd)', borderRadius: 10, padding: 14, color: 'var(--rd)', marginBottom: 20, fontSize: 13 }}>{error}</div>
          )}

          {/* Status decision box */}
          {claim && (
            <div style={{ background: meta.bg, border: `1px solid ${meta.color}33`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: meta.color, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Status</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>Case ID: {claim.case_id || '—'}</div>
                </div>
                <div style={{ fontSize: 40 }}>
                  {meta.label === 'Approved' ? '✅' : meta.label === 'Denied' ? '❌' : '⏳'}
                </div>
              </div>
            </div>
          )}

          {/* Processing timeline */}
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 24, marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 18 }}>Processing timeline</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {STATUS_STEPS.map((s, i) => {
                const done = i < stepsDone
                const active = i === stepsDone
                return (
                  <div key={s} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? 'var(--gn)' : active ? 'var(--ac)' : 'var(--s3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: done || active ? '#fff' : 'var(--t3)', flexShrink: 0 }}>
                        {done ? '✓' : i + 1}
                      </div>
                      {i < STATUS_STEPS.length - 1 && <div style={{ width: 1, height: 20, background: done ? 'var(--gn)' : 'var(--b)' }} />}
                    </div>
                    <div style={{ paddingBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: done || active ? 600 : 400, color: done ? 'var(--gn)' : active ? 'var(--ac)' : 'var(--t3)', marginTop: 5 }}>{s}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent cases */}
          {cases.length > 0 && (
            <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Recent cases</h2>
              {cases.map((c) => {
                const m = getStatusMeta(c.status)
                return (
                  <div key={c.case_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--b)' }}>
                    <div style={{ background: m.bg, color: m.color, borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 500 }}>{m.label}</div>
                    <div style={{ flex: 1, fontSize: 13, color: 'var(--t)', fontWeight: 500 }}>{c.case_id}</div>
                    {c.billed_amount && <div style={{ fontSize: 12, color: 'var(--t3)' }}>${c.billed_amount.toLocaleString()}</div>}
                    <div style={{ fontSize: 11, color: 'var(--t3)' }}>{c.updated_at?.slice(0, 10)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside style={{ width: 240, flexShrink: 0 }}>
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 12 }}>Quick actions</div>
            {[['📄', 'Submit new claim', '/submit'], ['📋', 'Review queue', '/queue'], ['🔍', 'Audit logs', '/logs']].map(([icon, label, path]) => (
              <button key={label as string} className="btn" style={{ width: '100%', marginBottom: 8, justifyContent: 'flex-start', gap: 8 }} onClick={() => navigate(path as string)}>
                {icon} {label}
              </button>
            ))}
          </div>
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Need help?</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7 }}>
              Contact your claims adjuster or call <strong>1-800-CLAIMS</strong> for urgent matters.
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
