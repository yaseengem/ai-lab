import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { SubmitClaimPage }  from '@/pages/SubmitClaimPage'
import { ClaimStatusPage }  from '@/pages/ClaimStatusPage'
import { ReviewQueuePage }  from '@/pages/ReviewQueuePage'
import { ReviewClaimPage }  from '@/pages/ReviewClaimPage'
import { AuditLogsPage }    from '@/pages/AuditLogsPage'
import { RulesEnginePage }  from '@/pages/RulesEnginePage'
import { SupervisorPage }   from '@/pages/SupervisorPage'

const NAV_LINKS = [
  { path: '/queue',      label: 'Review Queue' },
  { path: '/logs',       label: 'Run Logs' },
  { path: '/rules',      label: 'Rules' },
  { path: '/supervisor', label: 'Supervisor' },
]

function CalvinShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, height: 56, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--s)', borderBottom: '1px solid var(--b)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div style={{ width: 30, height: 30, background: 'var(--ac)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🤖</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Claim Processing Agent</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {NAV_LINKS.map(l => (
              <Link
                key={l.path}
                to={l.path}
                style={{ fontSize: 13, color: location.pathname.startsWith(l.path) ? 'var(--t)' : 'var(--t2)', textDecoration: 'none', fontWeight: location.pathname.startsWith(l.path) ? 600 : 400 }}
              >{l.label}</Link>
            ))}
          </div>
        </div>
        <button className="btn btn-p btn-sm" onClick={() => navigate('/submit')}>+ New claim</button>
      </nav>
      {children}
    </div>
  )
}

function HomePage() {
  const navigate = useNavigate()
  return (
    <div style={{ padding: '60px 40px', maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--t)', marginBottom: 8 }}>Claim Processing Agent</h1>
      <p style={{ fontSize: 15, color: 'var(--t2)', marginBottom: 40, lineHeight: 1.7 }}>
        Multi-agent insurance claims processing with human-in-the-loop review, fraud detection, and medical necessity validation.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 520, margin: '0 auto' }}>
        {[
          { icon: '📝', label: 'Submit a claim',     path: '/submit',     primary: true },
          { icon: '📋', label: 'Review queue',        path: '/queue',      primary: false },
          { icon: '🧾', label: 'Audit logs',          path: '/logs',       primary: false },
          { icon: '⚙️', label: 'Rules engine',        path: '/rules',      primary: false },
          { icon: '📊', label: 'Supervisor view',     path: '/supervisor', primary: false },
        ].map(item => (
          <button
            key={item.path}
            className={`btn ${item.primary ? 'btn-p' : ''}`}
            style={{ fontSize: 14, padding: '14px 20px', justifyContent: 'flex-start', gap: 10 }}
            onClick={() => navigate(item.path)}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <CalvinShell>
        <Routes>
          <Route path="/"                  element={<HomePage />} />
          <Route path="/submit"            element={<SubmitClaimPage />} />
          <Route path="/status/:sessionId" element={<ClaimStatusPage />} />
          <Route path="/queue"             element={<ReviewQueuePage />} />
          <Route path="/review/:caseId"    element={<ReviewClaimPage />} />
          <Route path="/logs"              element={<AuditLogsPage />} />
          <Route path="/rules"             element={<RulesEnginePage />} />
          <Route path="/supervisor"        element={<SupervisorPage />} />
        </Routes>
      </CalvinShell>
    </BrowserRouter>
  )
}
