/**
 * App — React Router v6 root.
 *
 * Marketplace routes (01–05 wireframes) live at the top level.
 * Legacy chat routes are kept for backward compatibility.
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom'

import { LandingPage } from '@/pages/LandingPage'
import { BrowseAgentsPage } from '@/pages/BrowseAgentsPage'
import { AgentDetailPage } from '@/pages/AgentDetailPage'
import { ConnectWorkspacePage } from '@/pages/ConnectWorkspacePage'
import { DashboardPage } from '@/pages/DashboardPage'

// Legacy chat pages (retained, accessible via /chat/* routes)
import { AgentListPage } from '@/pages/AgentListPage'
import { RoleSelectPage } from '@/pages/RoleSelectPage'
import { UserChatPage } from '@/pages/UserChatPage'
import { SupportChatPage } from '@/pages/SupportChatPage'
import { AdminChatPage } from '@/pages/AdminChatPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

import { MarketplaceShell } from '@/components/layout/MarketplaceShell'
import { AppShell } from '@/components/layout/AppShell'
import { AuthGate } from '@/components/auth/AuthGate'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthGate>
        <Routes>
          {/* ── Marketplace routes (light theme shell) ── */}
          <Route element={<MarketplaceShell />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/browse" element={<BrowseAgentsPage />} />
            <Route path="/agents/:agentId" element={<AgentDetailPage />} />
            <Route path="/connect/:agentId" element={<ConnectWorkspacePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>

          {/* ── Legacy chat routes (original AppShell) ── */}
          <Route path="/chat" element={<AppShell><AgentListPage /></AppShell>} />
          <Route path="/chat/:agentId" element={<AppShell><RoleSelectPage /></AppShell>} />
          <Route path="/chat/:agentId/user" element={<AppShell><UserChatPage /></AppShell>} />
          <Route path="/chat/:agentId/support" element={<AppShell><SupportChatPage /></AppShell>} />
          <Route path="/chat/:agentId/admin" element={<AppShell><AdminChatPage /></AppShell>} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  )
}
