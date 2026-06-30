import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Ribbon } from './components/Ribbon'
import { getPersona } from './persona'
import { isVerified } from './auth'
import { AuthGatePage } from './pages/AuthGatePage'
import { PersonaSelectPage } from './pages/PersonaSelectPage'
import { CommandCenterPage } from './pages/CommandCenterPage'
import { ChatPage } from './pages/ChatPage'
import { ProcessingPage } from './pages/ProcessingPage'
import { MemoryPage } from './pages/MemoryPage'
import { ArchitecturePage } from './pages/ArchitecturePage'
import { TestRunnerPage } from './pages/TestRunnerPage'
import { ConfigPage } from './pages/ConfigPage'

export { API } from './config'

/**
 * Two gates, in order:
 *   1. AUTH  — a verified SES email-OTP session (real access gate). No token ⇒ '/auth'.
 *   2. PERSONA — a chosen view in sessionStorage. None ⇒ '/' (persona select).
 * Only past both does a page render inside the Ribbon.
 */
function Gated({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  if (!isVerified()) {
    return <Navigate to="/auth" replace state={{ from: loc.pathname }} />
  }
  if (!getPersona()) {
    return <Navigate to="/" replace state={{ from: loc.pathname }} />
  }
  return <Ribbon>{children}</Ribbon>
}

/** The persona selector itself is behind the auth gate. */
function PersonaGate() {
  if (!isVerified()) return <Navigate to="/auth" replace />
  return <PersonaSelectPage />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Access gate */}
        <Route path="/auth" element={<AuthGatePage />} />

        {/* Persona select — start point once verified */}
        <Route path="/" element={<PersonaGate />} />

        {/* Everything else needs auth + persona and lives inside the Ribbon */}
        <Route path="/home" element={<Gated><CommandCenterPage /></Gated>} />
        <Route path="/chat" element={<Gated><ChatPage /></Gated>} />
        <Route path="/processing" element={<Gated><ProcessingPage /></Gated>} />
        <Route path="/memory" element={<Gated><MemoryPage /></Gated>} />
        <Route path="/architecture" element={<Gated><ArchitecturePage /></Gated>} />
        <Route path="/test-runner" element={<Gated><TestRunnerPage /></Gated>} />
        <Route path="/config" element={<Gated><ConfigPage /></Gated>} />

        {/* Unknown → start point */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
