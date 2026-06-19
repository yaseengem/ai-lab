/**
 * AppShell — top-level layout wrapper.
 *
 * Renders a header with "Neural" branding + breadcrumb navigation
 * derived from the current route path, then the page content.
 */

import { Link, useLocation } from 'react-router-dom'
import { getAgent } from '@/config/agents'

interface AppShellProps {
  children: React.ReactNode
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  // e.g. ['agents', 'claims', 'user']

  const crumbs: { label: string; to: string }[] = [{ label: 'Home', to: '/' }]

  if (parts[0] === 'agents') {
    const agentId = parts[1] as string | undefined
    if (agentId) {
      const agent = getAgent(agentId as never)
      crumbs.push({
        label: agent?.name ?? agentId,
        to: `/agents/${agentId}`,
      })

      if (parts[2]) {
        const roleLabels: Record<string, string> = {
          user: 'Customer',
          support: 'Support',
          admin: 'Admin',
        }
        crumbs.push({
          label: roleLabels[parts[2]] ?? parts[2],
          to: pathname,
        })
      }
    }
  }

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-gray-500">
      {crumbs.map((crumb, i) => (
        <span key={crumb.to} className="flex items-center gap-1">
          {i > 0 && <span className="text-gray-300">/</span>}
          {i < crumbs.length - 1 ? (
            <Link to={crumb.to} className="hover:text-gray-700 transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-4">
        <Link
          to="/"
          className="text-xl font-bold text-gray-900 tracking-tight hover:text-blue-600 transition-colors flex-shrink-0"
        >
          <img src="/logo.png" alt="Neural AI" style={{ height: 28, width: 'auto' }} />
        </Link>
        <Breadcrumbs />
      </header>

      {/* Page content */}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  )
}
