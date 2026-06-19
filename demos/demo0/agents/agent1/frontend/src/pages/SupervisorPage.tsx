import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCases, type ClaimRow } from '@/api/claims'

const MONTH_BARS = [45,52,38,60,70,42,40,65,72,58,80,55,46,43,100]

const ADJUSTERS = [
  { initials: 'SK', name: 'Sarah Kim',     role: 'Claims Adjuster', pending: 4, reviewed: 182, overrideRate: 6.2,  avgTime: 4.1, tagLabel: 'Top performer', tagColor: 'var(--gn)', tagBg: 'var(--gnd)', avatarBg: 'var(--acd)', avatarColor: 'var(--ac)' },
  { initials: 'MT', name: 'Marcus Torres', role: 'Claims Adjuster', pending: 2, reviewed: 134, overrideRate: 9.7,  avgTime: 5.2, tagLabel: '',             tagColor: '',           tagBg: '',            avatarBg: 'var(--tld)', avatarColor: 'var(--tl)' },
  { initials: 'JL', name: 'Jamie Lee',     role: 'Claims Adjuster', pending: 0, reviewed: 82,  overrideRate: 10.4, avgTime: 6.1, tagLabel: '',             tagColor: '',           tagBg: '',            avatarBg: 'var(--pud)', avatarColor: 'var(--pu)' },
]

const ESCALATED = [
  { caseId: 'CLM-08751', member: 'David Chen',       memberId: 'GHP-221104', proc: 'CPT 70553 — Brain MRI',                  amount: 6200,  outcome: 'Deny — no pre-auth',   conf: 54, reason: 'Confidence < 60%', sla: '6h', slaColor: 'var(--rd)' },
  { caseId: 'CLM-08699', member: 'Multiple members', memberId: 'Dr. Singh (NPI 9988776655)', proc: 'CPT 99215 — Office visit (complex) ×6', amount: 2940, outcome: 'On hold', conf: 0, reason: 'Fraud pattern — upcoding', sla: '18h', slaColor: 'var(--am)' },
]

const OVERRIDES = [
  { caseId: 'CLM-08612', aiSaid: 'Partial $12,400', aiColor: 'var(--am)', decided: 'Full $15,800', decidedColor: 'var(--gn)', reason: 'Member had valid waiver for OON provider', date: 'Apr 13' },
  { caseId: 'CLM-08580', aiSaid: 'Deny',            aiColor: 'var(--rd)', decided: 'Approve $4,200', decidedColor: 'var(--gn)', reason: 'Retro pre-auth granted by clinical team', date: 'Apr 11' },
  { caseId: 'CLM-08541', aiSaid: 'Approve $9,800',  aiColor: 'var(--gn)', decided: 'Deny',          decidedColor: 'var(--rd)', reason: 'Provider flagged by SIU after approval', date: 'Apr 9' },
]

export function SupervisorPage() {
  const navigate = useNavigate()
  const [cases, setCases] = useState<ClaimRow[]>([])

  useEffect(() => {
    fetchCases({ role: 'support_exec' })
      .then(rows => setCases(rows))
      .catch(() => {})
  }, [])

  const totalBilled   = cases.reduce((s, r) => s + (r.billed_amount ?? 0), 0)
  const totalApproved = cases.reduce((s, r) => s + (r.approved_amount ?? 0), 0)
  const pendingCount  = cases.filter(r => r.status === 'pending_approval').length

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Toolbar */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Supervisor dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>Claim Processing Agent · April 2026</div>
        </div>
        <button className="btn btn-sm" onClick={() => navigate('/rules')}>⚙️ Edit rules</button>
        <button className="btn btn-sm">📊 Export report</button>
        <button className="btn btn-sm" onClick={() => navigate('/queue')}>← Queue</button>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', borderBottom: '1px solid var(--b)' }}>
        {[
          { label: 'Total claims',      val: cases.length || 1284, sub: '↑ 18% vs Mar',  color: 'var(--t)',  subColor: 'var(--gn)' },
          { label: 'Auto-approved',     val: Math.floor((cases.length || 1284) * 0.66), sub: '66% of total', color: 'var(--gn)', subColor: 'var(--t3)' },
          { label: 'Human reviewed',    val: Math.floor((cases.length || 1284) * 0.31), sub: '31% of total', color: 'var(--am)', subColor: 'var(--t3)' },
          { label: 'AI override rate',  val: '8.4%', sub: '↑ 1.2% vs Mar',  color: 'var(--t)',  subColor: 'var(--rd)' },
          { label: 'Avg AI confidence', val: '94.2%', sub: '↑ 0.8%',         color: 'var(--t)',  subColor: 'var(--gn)' },
        ].map((s, i) => (
          <div key={i} style={{ padding: '16px 20px', borderRight: i < 4 ? '1px solid var(--b)' : undefined }}>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 11, color: s.subColor, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Body grid */}
      <div style={{ padding: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Alerts — full width */}
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 12 }}>🚨 Needs your attention</div>
          {[
            { type: 'danger', icon: '⚠️', title: 'CLM-08751 — David Chen escalated to you (confidence 54%)', desc: 'Confidence score below 60% — auto-escalated to supervisor per rules. Brain MRI, $6,200, no pre-auth found. SLA: 6h remaining.', action: 'Review now', onClick: () => navigate('/review/CLM-08751') },
            { type: 'danger', icon: '🛡️', title: 'Fraud pattern detected — Provider: Dr. A. Singh (NPI 9988776655)', desc: 'CPT 99215 billed 6 times in 14 days across 6 different members. Exceeds the 3-in-30-day threshold. All new claims from this provider are on hold.', action: 'Investigate', onClick: () => {} },
            { type: 'warn',   icon: '⏰', title: `${pendingCount || 2} claims approaching SLA deadline`, desc: 'Claims approaching the 24h SLA. Sarah K. has multiple claims assigned today.', action: 'View queue', onClick: () => navigate('/queue') },
            { type: 'info',   icon: '📋', title: 'CLM-08681 (James Moore, $38,200) is unassigned', desc: 'Spinal fusion claim worth $38,200 has been in queue for 3 hours with no adjuster assigned. SLA: 24h.', action: 'Assign adjuster', onClick: () => navigate('/queue') },
          ].map((alert, i) => {
            const bg   = alert.type === 'danger' ? 'var(--rdd)'  : alert.type === 'warn' ? 'var(--amd)'  : 'var(--acd)'
            const border = alert.type === 'danger' ? 'rgba(220,38,38,.2)' : alert.type === 'warn' ? 'rgba(217,119,6,.2)' : 'rgba(37,99,235,.2)'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: 9, marginBottom: 8, background: bg, border: `1px solid ${border}` }}>
                <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{alert.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 2 }}>{alert.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>{alert.desc}</div>
                </div>
                <button className="btn btn-sm btn-p" style={{ flexShrink: 0, marginLeft: 12 }} onClick={alert.onClick}>{alert.action}</button>
              </div>
            )
          })}
        </div>

        {/* Claims breakdown */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Claims outcome breakdown</div>
          {[
            { label: 'Auto-approved',      pct: 66, color: 'var(--gn)', val: '847 (66%)' },
            { label: 'Adjuster approved',  pct: 24, color: 'var(--ac)', val: '308 (24%)' },
            { label: 'Supervisor override', pct: 7, color: 'var(--pu)', val: '90 (7%)' },
            { label: 'Denied',             pct: 3,  color: 'var(--rd)', val: '39 (3%)' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)', width: 160, flexShrink: 0 }}>{b.label}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: b.color, width: `${b.pct}%` }} />
              </div>
              <div style={{ fontSize: 12, color: b.color, width: 44, textAlign: 'right' }}>{b.val}</div>
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--b)', margin: '14px 0' }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 10 }}>Daily volume — April</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
            {MONTH_BARS.map((h, i) => {
              const isToday = i === MONTH_BARS.length - 1
              const isWeekend = i === 5 || i === 6 || i === 13
              return <div key={i} style={{ flex: 1, borderRadius: '2px 2px 0 0', minWidth: 8, height: `${h}%`, background: isToday ? 'var(--ac)' : isWeekend ? 'var(--s3)' : 'var(--acd)' }} />
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
            <span>Apr 1</span><span>Today (128)</span>
          </div>
        </div>

        {/* Financial summary */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Financial summary</div>
          {[
            { k: 'Total billed',            v: totalBilled > 0   ? `$${(totalBilled/1000).toFixed(0)}k`   : '$4,821,400', vc: 'var(--t)' },
            { k: 'Total approved',          v: totalApproved > 0 ? `$${(totalApproved/1000).toFixed(0)}k` : '$3,944,200', vc: 'var(--gn)' },
            { k: 'Total denied',            v: '$191,800',   vc: 'var(--rd)' },
            { k: 'Pending (in review)',      v: '$84,200',    vc: 'var(--am)' },
            { k: 'Approval rate (by amount)', v: '81.8%',   vc: 'var(--t)' },
            { k: 'Avg claim approved',       v: '$3,072',    vc: 'var(--t)' },
            { k: 'Avg AI processing time',   v: '11.4s',     vc: 'var(--t)' },
            { k: 'Avg human review time',    v: '3.2 hours', vc: 'var(--t)' },
            { k: 'SLA breach rate',          v: '0.8%',      vc: 'var(--gn)' },
            { k: 'Supervisor override rate', v: '7.0%',      vc: 'var(--pu)' },
          ].map(({ k, v, vc }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--b)', fontSize: 13 }}>
              <span style={{ color: 'var(--t2)' }}>{k}</span>
              <span style={{ fontWeight: 600, color: vc }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Adjuster performance */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Adjuster performance</div>
          {ADJUSTERS.map(adj => (
            <div key={adj.initials} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--b)' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, background: adj.avatarBg, color: adj.avatarColor }}>{adj.initials}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--t)' }}>
                  {adj.name}
                  {adj.tagLabel && <span style={{ background: adj.tagBg, color: adj.tagColor, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 600, marginLeft: 6 }}>{adj.tagLabel}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{adj.role} · {adj.pending > 0 ? `Assigned ${adj.pending} pending` : '0 pending'}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, textAlign: 'center' }}>
                {[
                  { val: adj.reviewed, label: 'Reviewed', color: 'var(--t)' },
                  { val: `${adj.overrideRate}%`, label: 'Override rate', color: adj.overrideRate < 8 ? 'var(--gn)' : 'var(--am)' },
                  { val: `${adj.avgTime}h`, label: 'Avg time', color: 'var(--t)' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t3)' }}>Override rate = how often the adjuster changes the AI's recommendation</div>
        </div>

        {/* AI transparency metrics */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>AI transparency metrics</div>
          {[
            { label: 'Confidence ≥ 90%',  pct: 72, color: 'var(--gn)', val: '72%' },
            { label: 'Confidence 85–90%', pct: 16, color: 'var(--ac)', val: '16%' },
            { label: 'Confidence 75–85%', pct: 9,  color: 'var(--am)', val: '9%' },
            { label: 'Confidence < 75%',  pct: 3,  color: 'var(--rd)', val: '3%' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)', width: 160, flexShrink: 0 }}>{b.label}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 4, background: b.color, width: `${b.pct}%` }} />
              </div>
              <div style={{ fontSize: 12, color: b.color, width: 44, textAlign: 'right' }}>{b.val}</div>
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--b)', margin: '14px 0' }} />
          {[
            { k: 'Most common escalation reason', v: 'Amount > $2,000' },
            { k: 'Most overridden AI decision',   v: 'OON rate reduction' },
            { k: 'Avg steps per claim',           v: '9 / 9' },
            { k: 'Rerun rate',                    v: '1.8%' },
            { k: 'Fraud flags raised',            v: '5 this month', vc: 'var(--rd)' },
          ].map(({ k, v, vc }) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--b)', fontSize: 13 }}>
              <span style={{ color: 'var(--t2)' }}>{k}</span>
              <span style={{ fontWeight: 600, color: vc ?? 'var(--t)' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Supervisor escalation queue — full width */}
        <div style={{ gridColumn: 'span 2', background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)' }}>Escalated to supervisor</div>
            <span style={{ background: 'var(--rdd)', color: 'var(--rd)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>2 pending</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Claim ID', 'Member', 'Procedure', 'Amount', 'AI Outcome', 'Confidence', 'Escalation reason', 'SLA', 'Action'].map(h => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--b)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ESCALATED.map(row => (
                <tr key={row.caseId} style={{ cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', color: 'var(--ac)', fontWeight: 600, fontSize: 13 }}>{row.caseId}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontSize: 13 }}>
                    {row.member}<div style={{ fontSize: 11, color: 'var(--t3)' }}>{row.memberId}</div>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontSize: 13 }}>{row.proc}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontWeight: 600, fontSize: 13 }}>${row.amount.toLocaleString()}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)' }}>
                    <span style={{ background: 'var(--rdd)', color: 'var(--rd)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{row.outcome}</span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)' }}>
                    {row.conf > 0 ? (
                      <>
                        <span style={{ color: 'var(--rd)', fontWeight: 600, fontSize: 13 }}>{row.conf}%</span>
                        <div style={{ height: 5, borderRadius: 3, background: 'var(--s3)', overflow: 'hidden', marginTop: 4, width: 80 }}>
                          <div style={{ height: '100%', borderRadius: 3, background: 'var(--rd)', width: `${row.conf}%` }} />
                        </div>
                      </>
                    ) : <span style={{ color: 'var(--t3)', fontSize: 13 }}>—</span>}
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)' }}>
                    <span style={{ background: 'var(--rdd)', color: 'var(--rd)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{row.reason}</span>
                  </td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontSize: 12, fontWeight: 500, color: row.slaColor }}>⚠️ {row.sla} left</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-p" onClick={() => navigate(`/review/${row.caseId}`)}>Review</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Override history */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Recent supervisor overrides</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Claim', 'AI said', 'You decided', 'Reason', 'Date'].map(h => (
                  <th key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--b)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {OVERRIDES.map(row => (
                <tr key={row.caseId}>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', color: 'var(--ac)', fontWeight: 500, fontSize: 13 }}>{row.caseId}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', color: row.aiColor, fontSize: 13 }}>{row.aiSaid}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', color: row.decidedColor, fontSize: 13 }}>{row.decided}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontSize: 12, color: 'var(--t2)' }}>{row.reason}</td>
                  <td style={{ padding: '10px', borderBottom: '1px solid var(--b)', fontSize: 12, color: 'var(--t3)' }}>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick actions */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 14 }}>Quick actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['⚙️', 'Edit agent rules',                () => navigate('/rules')],
              ['📋', 'View full review queue',          () => navigate('/queue')],
              ['🧾', 'Full audit log',                  () => navigate('/logs')],
              ['👥', 'Reassign claims',                 () => {}],
              ['📧', 'Bulk claimant communications',    () => {}],
              ['📊', 'Export compliance report (PDF)',  () => {}],
            ].map(([icon, label, onClick]) => (
              <button
                key={label as string}
                className="btn"
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}
                onClick={onClick as () => void}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
