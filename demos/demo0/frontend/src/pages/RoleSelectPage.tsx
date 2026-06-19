/**
 * RoleSelectPage — role selection for an agent.
 *
 * Route: /agents/:agentId
 */

import { useNavigate, useParams } from 'react-router-dom'
import { getAgent, ROLE_DESCRIPTIONS } from '@/config/agents'
import type { Role } from '@/types/agent'

// path = URL segment; id = backend Role value
const ROLES: { id: Role; path: string; label: string; icon: string }[] = [
  { id: 'end_user', path: 'user', label: 'Customer', icon: '👤' },
  { id: 'support_exec', path: 'support', label: 'Support Agent', icon: '🎧' },
  { id: 'admin', path: 'admin', label: 'Administrator', icon: '⚙️' },
]

export function RoleSelectPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()
  const agent = agentId ? getAgent(agentId as never) : null

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-gray-500">Agent not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <span className="text-5xl">{agent.icon}</span>
          <h2 className="mt-3 text-2xl font-bold text-gray-900">{agent.name}</h2>
          <p className="mt-1 text-gray-500 text-sm">{agent.description}</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider text-center">
            Select your role
          </p>
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => navigate(`/agents/${agentId}/${role.path}`)}
              className="w-full flex items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white px-5 py-4 text-left hover:border-blue-400 hover:bg-blue-50 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span className="text-2xl" aria-hidden="true">
                {role.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">{role.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ROLE_DESCRIPTIONS[role.id]}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
