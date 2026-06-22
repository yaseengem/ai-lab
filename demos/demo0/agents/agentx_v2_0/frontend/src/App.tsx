import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Ribbon } from './components/Ribbon'
import { getPersona } from './persona'
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
 * Gate: every page except the persona selector requires a persona in
 * sessionStorage. Without one we bounce back to '/', which is the start point.
 */
function Gated({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  if (!getPersona()) {
    return <Navigate to="/" replace state={{ from: loc.pathname }} />
  }
  return <Ribbon>{children}</Ribbon>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Start point / gate */}
        <Route path="/" element={<PersonaSelectPage />} />

        {/* Everything else lives inside the Ribbon and needs a persona */}
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
