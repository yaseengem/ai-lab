import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const INDUSTRIES = [
  { id: 'ins', label: 'Insurance', icon: '🏥', color: 'var(--acd)', text: 'var(--ac)', count: 48, tags: ['Claims Processing', 'Underwriting', 'Fraud Detection'], cls: 'tb', span: 2 },
  { id: 'hc',  label: 'Healthcare', icon: '🩺', color: 'var(--gnd)', text: 'var(--gn)', count: 32, tags: ['Prior Auth', 'Coding'], cls: 'tg', span: 1 },
  { id: 're',  label: 'Real Estate', icon: '🏠', color: 'var(--amd)', text: 'var(--am)', count: 24, tags: ['Loan Onboarding', 'Title Review'], cls: 'tam', span: 1 },
  { id: 'bk',  label: 'Banking & Finance', icon: '🏦', color: 'var(--pud)', text: 'var(--pu)', count: 36, tags: ['KYC/AML', 'Loan Decisioning'], cls: 'tp', span: 1 },
  { id: 'lg',  label: 'Legal', icon: '⚖️', color: 'var(--tld)', text: 'var(--tl)', count: 18, tags: ['Contracts', 'Due Diligence'], cls: 'tt', span: 1 },
  { id: 'hr',  label: 'HR & Workforce', icon: '👥', color: 'var(--cod)', text: 'var(--co)', count: 22, tags: ['Benefits', 'Onboarding'], cls: 'tco', span: 1 },
]

const FEATURED = [
  { icon: '🔍', bg: 'var(--acd)', name: 'Claims Processing Agent', by: 'InsureTech Labs · Insurance', price: '$199/mo', rating: '4.9', deploys: '340', desc: 'End-to-end health claim intake, document validation, fraud check and adjudication with human-in-the-loop approval workflow.', tag: 'Health Insurance', tagCls: 'tb' },
  { icon: '📋', bg: 'var(--gnd)', name: 'Group Underwriting Agent', by: 'RiskAI Corp · Insurance', price: '$149/mo', rating: '4.7', deploys: '210', desc: 'Automated risk scoring, member eligibility review and premium calculation for group health insurance plans.', tag: 'Underwriting', tagCls: 'tg' },
  { icon: '🏠', bg: 'var(--amd)', name: 'Loan Onboarding Agent', by: 'PropFlow AI · Real Estate', price: '$179/mo', rating: '4.8', deploys: '180', desc: 'Automates real estate loan application intake, document verification, title checks and compliance screening.', tag: 'Real Estate', tagCls: 'tam' },
]

const TRUST = [
  { icon: '🔒', title: 'HIPAA & SOC 2', sub: 'Compliant infrastructure for regulated industries' },
  { icon: '🧾', title: 'Full audit trails', sub: 'Every agent action logged and traceable' },
  { icon: '👁️', title: 'AI transparency', sub: 'Step-by-step reasoning visible on every run' },
  { icon: '🤝', title: 'Human-in-the-loop', sub: 'Configurable approval workflows built in' },
  { icon: '⚡', title: '99.4% uptime SLA', sub: 'Enterprise-grade reliability and support' },
]

export function LandingPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) (e.target as HTMLElement).classList.add('v') }),
      { threshold: 0.08 }
    )
    document.querySelectorAll('.fi').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [])

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--t)' }}>

      {/* HERO */}
      <section style={{ minHeight: '92vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px 60px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(var(--b) 1px, transparent 1px), linear-gradient(90deg, var(--b) 1px, transparent 1px)`, backgroundSize: '56px 56px', opacity: 0.4 }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--acd)', border: '1px solid rgba(37,99,235,.25)', borderRadius: 20, padding: '6px 16px', fontSize: 12, fontWeight: 500, color: 'var(--ac)', marginBottom: 28 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ac)', display: 'inline-block' }} />
            AI agents built for regulated industries
          </div>
          <h1 style={{ fontSize: 'clamp(36px,6vw,58px)', fontWeight: 700, lineHeight: 1.08, letterSpacing: '-1.5px', color: 'var(--t)', marginBottom: 20 }}>
            The marketplace for<br /><em style={{ fontStyle: 'italic', color: 'var(--ac)' }}>intelligent</em> AI agents
          </h1>
          <p style={{ fontSize: 17, color: 'var(--t2)', lineHeight: 1.75, maxWidth: 560, margin: '0 auto 36px', fontWeight: 300 }}>
            Find, deploy and run pre-built AI agents for insurance, healthcare, real estate, banking and more — no engineering required.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
            <button className="btn btn-p btn-lg" onClick={() => navigate('/browse')}>Browse agents →</button>
            <button className="btn btn-lg" onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 36, marginTop: 60, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[['180+', 'AI agents'], ['12', 'Industries'], ['2,400+', 'Businesses using AI Lab'], ['99.4%', 'Uptime SLA']].map(([n, l], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
                {i > 0 && <div style={{ width: 1, height: 34, background: 'var(--b2)' }} />}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--t)', lineHeight: 1 }}>{n}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section style={{ padding: '64px 40px', borderTop: '1px solid var(--b)' }}>
        <div className="fi" style={{ textAlign: 'center', marginBottom: 48, maxWidth: 1060, margin: '0 auto 48px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 11 }}>Built for your industry</div>
          <h2 style={{ fontSize: 36, fontWeight: 700, color: 'var(--t)', marginBottom: 12, letterSpacing: '-.5px' }}>Agents for every regulated sector</h2>
          <p style={{ fontSize: 15, color: 'var(--t2)', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>Each agent is purpose-built for the compliance, workflow and data requirements of its industry.</p>
        </div>
        <div className="fi" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 15, maxWidth: 1060, margin: '0 auto' }}>
          {INDUSTRIES.map((ind) => (
            <div key={ind.id} onClick={() => navigate(`/browse?industry=${ind.id}`)}
              style={{ gridColumn: ind.span === 2 ? 'span 2' : undefined, background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 14, padding: 26, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = '' }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 11, background: ind.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, marginBottom: 14 }}>{ind.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>{ind.label}</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.65, marginBottom: 15 }}>Purpose-built agents for {ind.label.toLowerCase()} workflows with compliance built in.</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {ind.tags.map((t) => <span key={t} className={`tag ${ind.cls}`}>{t}</span>)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 9 }}>{ind.count} agents available</div>
                </div>
                <span style={{ fontSize: 16, color: 'var(--t3)' }}>→</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" style={{ padding: '64px 40px', background: 'var(--s)', borderTop: '1px solid var(--b)', borderBottom: '1px solid var(--b)' }}>
        <div className="fi" style={{ textAlign: 'center', marginBottom: 48, maxWidth: 1060, margin: '0 auto 48px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 11 }}>How it works</div>
          <h2 style={{ fontSize: 36, fontWeight: 700, color: 'var(--t)', letterSpacing: '-.5px' }}>From browse to running in minutes</h2>
        </div>
        <div className="fi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, maxWidth: 1060, margin: '0 auto', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 26, left: '12%', right: '12%', height: 1, background: 'var(--b2)' }} />
          {[
            ['01', 'Browse & select', 'Filter by industry, capability and compliance. Read specs and reviews before committing.'],
            ['02', 'Connect your systems', 'One-click integrations with enterprise tools and data systems.'],
            ['03', 'Configure rules', 'Set approval thresholds and escalation rules in plain English. No coding.'],
            ['04', 'Deploy & monitor', 'Full audit trails, AI reasoning logs and human-in-the-loop controls built in.'],
          ].map(([n, title, desc]) => (
            <div key={n} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', border: '1px solid var(--b2)', background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 16, fontWeight: 700, color: 'var(--ac)' }}>{n}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 7 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.65 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED AGENTS */}
      <section style={{ padding: '64px 40px' }}>
        <div className="fi" style={{ textAlign: 'center', marginBottom: 48, maxWidth: 1060, margin: '0 auto 48px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ac)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 11 }}>Featured agents</div>
          <h2 style={{ fontSize: 36, fontWeight: 700, color: 'var(--t)', letterSpacing: '-.5px' }}>Most deployed this month</h2>
        </div>
        <div className="fi" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 15, maxWidth: 1060, margin: '0 auto' }}>
          {FEATURED.map((a) => (
            <div key={a.name} onClick={() => navigate('/browse')} style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: 20, cursor: 'pointer', transition: 'all .2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--b2)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.borderColor = 'var(--b)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 11 }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: a.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{a.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gn)' }}>{a.price}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 3 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>{a.by}</div>
              <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.65, margin: '9px 0 12px' }}>{a.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>{a.rating} rating · {a.deploys} deployments</div>
                <span className={`tag ${a.tagCls}`}>{a.tag}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="fi" style={{ textAlign: 'center', marginTop: 28 }}>
          <button className="btn btn-lg" onClick={() => navigate('/browse')}>View all 180+ agents →</button>
        </div>
      </section>

      {/* TRUST */}
      <section style={{ padding: '56px 40px', borderTop: '1px solid var(--b)' }}>
        <div className="fi" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 44, flexWrap: 'wrap', maxWidth: 1060, margin: '0 auto' }}>
          {TRUST.map((t) => (
            <div key={t.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: 190 }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{t.icon}</div>
              <div>
                <strong style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--t)', marginBottom: 2 }}>{t.title}</strong>
                <span style={{ fontSize: 12, color: 'var(--t2)' }}>{t.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '64px 40px', borderTop: '1px solid var(--b)' }}>
        <div className="fi" style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 20, padding: '60px 48px', maxWidth: 660, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 34, fontWeight: 700, color: 'var(--t)', marginBottom: 12, letterSpacing: '-.5px' }}>Ready to deploy your first agent?</h2>
          <p style={{ fontSize: 14, color: 'var(--t2)', marginBottom: 26 }}>Start with a 14-day free trial. No credit card required. Full access to all features.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-p btn-lg" onClick={() => navigate('/browse')}>Start free trial</button>
            <button className="btn btn-lg">Talk to sales</button>
          </div>
        </div>
      </section>

    </div>
  )
}
