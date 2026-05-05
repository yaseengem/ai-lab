import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type RuleCat = 'approve' | 'review' | 'fraud' | 'deny'
type TabFilter = 'all' | RuleCat

interface Rule {
  id: string
  cat: RuleCat
  icon: string
  title: string
  text: string
  tags: string[]
  addedBy: string
  addedDate: string
  matchCount: number
  enabled: boolean
}

const INITIAL_RULES: Rule[] = [
  {
    id: 'R001', cat: 'approve', icon: '✅',
    title: 'Auto-approve low-value standard claims',
    text: 'If the total billed amount is under $500 AND the member has been continuously active for more than 12 months AND the procedure code is on the standard covered procedures list, auto-approve at the full billed amount without routing to human review.',
    tags: ['Amount', 'Member tenure', 'Standard procedure'],
    addedBy: 'Sarah K.', addedDate: 'Mar 12, 2026', matchCount: 412, enabled: true,
  },
  {
    id: 'R002', cat: 'approve', icon: '✅',
    title: 'Auto-approve preventive care at 100%',
    text: 'If the procedure is classified as preventive care (annual physical CPT 99395–99397, standard immunizations CPT 90460–90461, mammogram CPT 77067, colonoscopy CPT 45378) AND the member\'s plan includes 100% preventive coverage with no co-pay, auto-approve at the full billed amount regardless of dollar value.',
    tags: ['Preventive care', 'Full coverage'],
    addedBy: 'Admin', addedDate: 'Jan 10, 2026', matchCount: 218, enabled: true,
  },
  {
    id: 'R003', cat: 'approve', icon: '✅',
    title: 'Auto-approve repeat prescriptions under $200',
    text: 'If the claim is for a prescription drug refill (same NDC code as a claim approved in the past 90 days for the same member) AND the billed amount is under $200, auto-approve at the full billed amount with no human review required.',
    tags: ['Prescription', 'Repeat claim'],
    addedBy: 'Marcus T.', addedDate: 'Feb 8, 2026', matchCount: 155, enabled: true,
  },
  {
    id: 'R004', cat: 'review', icon: '👤',
    title: 'Mandatory review for high-value claims',
    text: 'Always route to human review if the total billed amount exceeds $2,000, regardless of confidence score or any other rule. This is a mandatory threshold rule and cannot be overridden by auto-approve rules.',
    tags: ['Amount threshold', 'Mandatory'],
    addedBy: 'Admin', addedDate: 'Jan 10, 2026', matchCount: 284, enabled: true,
  },
  {
    id: 'R005', cat: 'review', icon: '👤',
    title: 'Review when confidence score is below threshold',
    text: 'If the agent\'s QA confidence score is below 85%, route to the assigned claims adjuster for review. If the confidence score is below 60%, bypass the adjuster queue entirely and escalate directly to a supervisor.',
    tags: ['Confidence score', 'Escalation'],
    addedBy: 'Sarah K.', addedDate: 'Feb 22, 2026', matchCount: 98, enabled: true,
  },
  {
    id: 'R006', cat: 'review', icon: '👤',
    title: 'Review out-of-network surgical claims',
    text: 'If the provider is out-of-network AND the claim is for a surgical procedure (CPT range 10000–69999) AND the billed amount exceeds $5,000, always route to a human reviewer regardless of confidence score.',
    tags: ['Network status', 'Surgical'],
    addedBy: 'Marcus T.', addedDate: 'Mar 5, 2026', matchCount: 16, enabled: true,
  },
  {
    id: 'R007', cat: 'fraud', icon: '🛡️',
    title: 'Flag provider upcoding patterns',
    text: 'If the same ICD-CPT procedure combination has been billed by the same provider (NPI) more than 3 times in any 30-day window across different members, flag all new claims from that provider as potential upcoding fraud and route immediately to a supervisor for investigation.',
    tags: ['Provider pattern', 'Fraud', 'Supervisor'],
    addedBy: 'Admin', addedDate: 'Jan 10, 2026', matchCount: 2, enabled: true,
  },
  {
    id: 'R008', cat: 'fraud', icon: '🛡️',
    title: 'Flag high-frequency member claim patterns',
    text: 'If a single member submits more than 4 claims within any 30-day period, flag all subsequent claims from that member for mandatory human review until a supervisor reviews the member\'s full claim history and clears the flag.',
    tags: ['Member frequency', 'Fraud'],
    addedBy: 'Sarah K.', addedDate: 'Mar 20, 2026', matchCount: 3, enabled: true,
  },
  {
    id: 'R009', cat: 'deny', icon: '❌',
    title: 'Recommend denial for missing pre-authorization',
    text: 'If the procedure requires pre-authorization per the plan\'s benefit schedule AND no valid pre-authorization record is found in the system AND the billed amount exceeds $1,000, recommend denial with the reason "Pre-authorization required but not on file." Always route to a human reviewer before finalizing the denial.',
    tags: ['Pre-auth', 'Denial', 'Human confirms'],
    addedBy: 'Admin', addedDate: 'Jan 10, 2026', matchCount: 23, enabled: true,
  },
]

const CAT_COLORS: Record<RuleCat, { accent: string; bg: string }> = {
  approve: { accent: 'var(--gn)', bg: 'var(--gnd)' },
  review:  { accent: 'var(--am)', bg: 'var(--amd)' },
  fraud:   { accent: 'var(--rd)', bg: 'var(--rdd)' },
  deny:    { accent: 'var(--rd)', bg: 'var(--rdd)' },
}
const CAT_LABELS: Record<RuleCat, string> = {
  approve: 'Auto-approve rules',
  review:  'Flag for human review',
  fraud:   'Fraud flag rules',
  deny:    'Denial rules',
}

const CAT_TABS: { key: TabFilter; label: string }[] = [
  { key: 'all',     label: 'All rules' },
  { key: 'approve', label: 'Auto-approve' },
  { key: 'review',  label: 'Flag for review' },
  { key: 'fraud',   label: 'Fraud flags' },
  { key: 'deny',    label: 'Denial' },
]

export function RulesEnginePage() {
  const navigate = useNavigate()
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES)
  const [tab, setTab] = useState<TabFilter>('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editRule, setEditRule] = useState<Rule | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [showImpact, setShowImpact] = useState(false)

  const [formCat, setFormCat] = useState<RuleCat>('review')
  const [formTitle, setFormTitle] = useState('')
  const [formText, setFormText] = useState('')
  const [formTags, setFormTags] = useState('')

  const visible = rules.filter(r => {
    if (tab !== 'all' && r.cat !== tab) return false
    if (search) return r.title.toLowerCase().includes(search.toLowerCase()) || r.text.toLowerCase().includes(search.toLowerCase())
    return true
  })

  const grouped = (['approve', 'review', 'fraud', 'deny'] as RuleCat[]).map(cat => ({
    cat,
    rules: visible.filter(r => r.cat === cat),
  })).filter(g => g.rules.length > 0 || tab === 'all')

  const openAdd = () => {
    setEditRule(null)
    setFormCat('review')
    setFormTitle('')
    setFormText('')
    setFormTags('')
    setShowModal(true)
  }

  const openEdit = (r: Rule) => {
    setEditRule(r)
    setFormCat(r.cat)
    setFormTitle(r.title)
    setFormText(r.text)
    setFormTags(r.tags.join(', '))
    setShowModal(true)
  }

  const saveRule = () => {
    if (editRule) {
      setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, cat: formCat, title: formTitle, text: formText, tags: formTags.split(',').map(t => t.trim()).filter(Boolean) } : r))
    } else {
      const newId = `R${String(rules.length + 1).padStart(3, '0')}`
      setRules(prev => [...prev, { id: newId, cat: formCat, icon: formCat === 'approve' ? '✅' : formCat === 'review' ? '👤' : formCat === 'fraud' ? '🛡️' : '❌', title: formTitle, text: formText, tags: formTags.split(',').map(t => t.trim()).filter(Boolean), addedBy: 'You', addedDate: 'Apr 2026', matchCount: 0, enabled: true }])
    }
    setShowModal(false)
    setShowImpact(true)
    setTimeout(() => setShowImpact(false), 4000)
  }

  const toggleRule = (id: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r))
    setShowImpact(true)
    setTimeout(() => setShowImpact(false), 4000)
  }

  const confirmDelete = () => {
    if (deleteTarget) setRules(prev => prev.filter(r => r.id !== deleteTarget))
    setDeleteTarget(null)
  }

  const countForCat = (cat: RuleCat) => rules.filter(r => r.cat === cat && r.enabled).length

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Toolbar */}
      <div style={{ background: 'var(--s)', borderBottom: '1px solid var(--b)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t)' }}>Rules engine</div>
          <div style={{ fontSize: 12, color: 'var(--t2)' }}>Claims Processing Agent · {rules.filter(r => r.enabled).length} active rules · Last updated Apr 15, 2026</div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search rules..."
          style={{ width: 220, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)' }}
        />
        <button className="btn btn-sm" onClick={() => navigate('/queue')}>← Queue</button>
        <button className="btn btn-sm btn-p" onClick={openAdd}>+ Add rule</button>
      </div>

      {/* Info banner */}
      <div style={{ background: 'var(--acd)', borderBottom: '1px solid rgba(37,99,235,.2)', padding: '11px 32px', fontSize: 12, color: 'var(--t2)' }}>
        <strong style={{ color: 'var(--t)' }}>ℹ️ How rules work:</strong> Rules are written in plain English and applied by the agent during the QA step. Rules are evaluated in order — the first matching rule wins. All changes are logged.
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--b)', padding: '0 32px', background: 'var(--s)' }}>
        {CAT_TABS.map(t => {
          const count = t.key === 'all' ? rules.filter(r => r.enabled).length : countForCat(t.key as RuleCat)
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ padding: '11px 18px', fontSize: 13, fontWeight: 500, color: tab === t.key ? 'var(--ac)' : 'var(--t2)', cursor: 'pointer', border: 'none', borderBottom: `2px solid ${tab === t.key ? 'var(--ac)' : 'transparent'}`, background: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, transition: 'all .15s' }}
            >
              {t.label}
              <span style={{ fontSize: 11, background: 'var(--s2)', borderRadius: 20, padding: '1px 7px', fontWeight: 600 }}>{count}</span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Impact banner */}
        {showImpact && (
          <div style={{ background: 'var(--amd)', border: '1px solid var(--am)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: 'var(--t2)' }}>
            ⚠️ <strong style={{ color: 'var(--am)' }}>Rule updated.</strong> This change takes effect on the next agent run. Based on last month's data, this rule would have affected approximately <strong style={{ color: 'var(--t)' }}>124 claims</strong>.
          </div>
        )}

        {/* Rules by category */}
        {grouped.map(({ cat, rules: catRules }) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            {(tab === 'all') && (
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[cat].accent, display: 'inline-block' }} />
                {CAT_LABELS[cat]}
              </div>
            )}
            {catRules.map(rule => (
              <div
                key={rule.id}
                style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 11, padding: 18, marginBottom: 12, opacity: rule.enabled ? 1 : 0.5 }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0, background: CAT_COLORS[rule.cat].bg }}>{rule.icon}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 3 }}>{rule.title}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        {rule.tags.map(tag => (
                          <span key={tag} style={{ background: 'var(--s3)', color: 'var(--t2)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Toggle */}
                    <div
                      onClick={() => toggleRule(rule.id)}
                      style={{ width: 38, height: 20, borderRadius: 20, background: rule.enabled ? 'var(--gn)' : 'var(--s3)', border: '1px solid', borderColor: rule.enabled ? 'var(--gn)' : 'var(--b2)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background .2s' }}
                    >
                      <div style={{ position: 'absolute', width: 14, height: 14, borderRadius: '50%', background: '#fff', top: 2, left: rule.enabled ? 22 : 2, transition: 'left .2s' }} />
                    </div>
                    <span style={{ background: rule.enabled ? 'var(--gnd)' : 'var(--s3)', color: rule.enabled ? 'var(--gn)' : 'var(--t2)', borderRadius: 20, padding: '3px 9px', fontSize: 11, fontWeight: 500 }}>{rule.enabled ? 'Active' : 'Disabled'}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.7, marginBottom: 10, padding: '11px 14px', background: 'var(--s2)', borderRadius: 8, borderLeft: `3px solid ${CAT_COLORS[rule.cat].accent}` }}>
                  {rule.text}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ background: 'var(--s2)', borderRadius: 7, padding: '7px 12px', fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <strong style={{ color: 'var(--t)' }}>{rule.matchCount}</strong>
                      <span style={{ color: 'var(--t3)' }}>claims matched last month</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginLeft: 'auto' }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>Added by {rule.addedBy} · {rule.addedDate}</span>
                    <button className="btn btn-sm" onClick={() => openEdit(rule)}>Edit</button>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'var(--rdd)', borderColor: 'var(--rd)', color: 'var(--rd)' }}
                      onClick={() => setDeleteTarget(rule.id)}
                    >Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Add/Edit modal */}
      {showModal && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowModal(false)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 501, background: 'var(--s)', border: '1px solid var(--b2)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>{editRule ? `Edit rule ${editRule.id}` : 'Add new rule'}</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 18 }}>Write your rule in plain English. The agent will interpret and apply it during the QA step.</div>
            {[
              { label: 'Rule type', node: (
                <select value={formCat} onChange={e => setFormCat(e.target.value as RuleCat)} style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)' }}>
                  <option value="approve">Auto-approve</option>
                  <option value="review">Flag for human review</option>
                  <option value="fraud">Fraud flag</option>
                  <option value="deny">Recommend denial</option>
                </select>
              )},
              { label: 'Rule title', node: <input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Short descriptive title" style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)', boxSizing: 'border-box' as const }} /> },
              { label: 'Rule description — write in plain English', node: <textarea rows={5} value={formText} onChange={e => setFormText(e.target.value)} placeholder="Describe the rule clearly. Include all conditions..." style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)', resize: 'vertical' as const, fontFamily: 'inherit', boxSizing: 'border-box' as const }} /> },
              { label: 'Tags — comma separated', node: <input value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="e.g. amount threshold, CPT range" style={{ width: '100%', padding: '8px 12px', borderRadius: 7, border: '1px solid var(--b2)', fontSize: 13, background: 'var(--s2)', color: 'var(--t)', boxSizing: 'border-box' as const }} /> },
            ].map(({ label, node }) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>{label}</label>
                {node}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-p" onClick={saveRule}>Save rule</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteTarget(null)} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 501, background: 'var(--s)', border: '1px solid var(--b2)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 460 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--rd)', marginBottom: 6 }}>Delete rule?</div>
            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 18 }}>This rule will be permanently removed and will no longer apply to new claims. This action cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn" style={{ background: 'var(--rdd)', borderColor: 'var(--rd)', color: 'var(--rd)' }} onClick={confirmDelete}>Delete rule</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
