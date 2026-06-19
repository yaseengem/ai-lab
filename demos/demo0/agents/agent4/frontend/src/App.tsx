import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { RunContextProvider, useRun } from './context/RunContext'
import { CommandCenterPage } from './pages/CommandCenterPage'
import { WatchlistPage } from './pages/WatchlistPage'
import { TradeDetailPage } from './pages/TradeDetailPage'
import { InterventionPlanPage } from './pages/InterventionPlanPage'
import { LolrExecutionPage } from './pages/LolrExecutionPage'
import { SettlementRollPage } from './pages/SettlementRollPage'
import { EscalationsPage } from './pages/EscalationsPage'
import { CounterpartyProfilesPage } from './pages/CounterpartyProfilesPage'
import { MonitorPage } from './pages/MonitorPage'
import { AuditReportPage } from './pages/AuditReportPage'
import { RuleConfigPage } from './pages/RuleConfigPage'
import { AlertsPage } from './pages/AlertsPage'
import { TestRunnerPage } from './pages/TestRunnerPage'
import { RunsPage } from './pages/RunsPage'
import { RunDetailPage } from './pages/RunDetailPage'

export { API } from './config'

const NAV = [
  { section: 'OVERVIEW', items: [{ path: '/', label: 'Dashboard' }] },
  {
    section: 'MONITORING',
    items: [
      { path: '/watchlist', label: 'Settlement Watchlist' },
      { path: '/counterparties', label: 'Counterparty Profiles' },
    ],
  },
  {
    section: 'INTERVENTIONS',
    items: [
      { path: '/intervention-plan', label: 'Intervention Plan' },
      { path: '/lolr-execution', label: 'LOLR Execution' },
      { path: '/settlement-rolls', label: 'Settlement Rolls' },
    ],
  },
  { section: 'APPROVALS', items: [{ path: '/escalations', label: 'Human Escalations', badge: 'approvals' as const }] },
  {
    section: 'PIPELINE',
    items: [
      { path: '/monitor', label: 'Pipeline Monitor' },
      { path: '/test-runner', label: 'Test Runner' },
      { path: '/runs', label: 'Runs' },
    ],
  },
  {
    section: 'COMPLIANCE',
    items: [
      { path: '/audit-report', label: 'FSCA Audit Report' },
      { path: '/alerts', label: 'Alerts & Notifications', badge: 'alerts' as const },
    ],
  },
  { section: 'ADMIN', items: [{ path: '/rules', label: 'Rule Configuration' }] },
]

function Sidebar() {
  const loc = useLocation()
  const { pendingApprovals, alerts } = useRun()
  const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged).length

  return (
    <aside style={{
      width: 220, flexShrink: 0, background: 'var(--s)', borderRight: '1px solid var(--b)',
      overflowY: 'auto', padding: '16px 0',
    }}>
      {NAV.map(section => (
        <div key={section.section} style={{ marginBottom: 4 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--t3)',
            padding: '8px 20px 4px', textTransform: 'uppercase',
          }}>
            {section.section}
          </div>
          {section.items.map(item => {
            const active = item.path === '/'
              ? loc.pathname === '/'
              : loc.pathname.startsWith(item.path)
            const badgeCount = item.badge === 'approvals'
              ? pendingApprovals.length
              : item.badge === 'alerts'
                ? unacknowledgedAlerts
                : 0
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 20px', textDecoration: 'none', fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--ac)' : 'var(--t2)',
                  background: active ? 'var(--acd)' : 'transparent',
                  borderLeft: active ? '3px solid var(--ac)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#fff',
                    background: 'var(--rd)', borderRadius: 10, padding: '1px 6px', minWidth: 18, textAlign: 'center',
                  }}>
                    {badgeCount}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ))}
    </aside>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <nav style={{
        height: 56, padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', background: 'var(--s)', borderBottom: '1px solid var(--b)',
        flexShrink: 0, zIndex: 100,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div style={{
            width: 30, height: 30, background: 'var(--ac)', borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#fff', fontWeight: 700,
          }}>N</div>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>Settlement Failure Prevention</span>
        </Link>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>JSE — UC8 Agentic AI</span>
      </nav>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <RunContextProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<CommandCenterPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/watchlist/:tradeId" element={<TradeDetailPage />} />
            <Route path="/intervention-plan" element={<InterventionPlanPage />} />
            <Route path="/lolr-execution" element={<LolrExecutionPage />} />
            <Route path="/settlement-rolls" element={<SettlementRollPage />} />
            <Route path="/escalations" element={<EscalationsPage />} />
            <Route path="/counterparties" element={<CounterpartyProfilesPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/audit-report" element={<AuditReportPage />} />
            <Route path="/rules" element={<RuleConfigPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/test-runner" element={<TestRunnerPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/runs/:sessionId" element={<RunDetailPage />} />
          </Routes>
        </Shell>
      </RunContextProvider>
    </BrowserRouter>
  )
}
