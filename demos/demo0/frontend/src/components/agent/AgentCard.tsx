/**
 * AgentCard — clickable card that navigates to /agents/{id}.
 */

import { useNavigate } from 'react-router-dom'
import type { AgentConfig } from '@/types/agent'

interface AgentCardProps {
  agent: AgentConfig
}

const COLOR_VARIANTS: Record<string, string> = {
  blue: 'border-blue-200 hover:border-blue-400 bg-blue-50 hover:bg-blue-100',
  green: 'border-green-200 hover:border-green-400 bg-green-50 hover:bg-green-100',
  purple: 'border-purple-200 hover:border-purple-400 bg-purple-50 hover:bg-purple-100',
}

const ICON_COLOR: Record<string, string> = {
  blue: 'text-blue-600',
  green: 'text-green-600',
  purple: 'text-purple-600',
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate()
  const colorClass = COLOR_VARIANTS[agent.color] ?? COLOR_VARIANTS.blue
  const iconColor = ICON_COLOR[agent.color] ?? ICON_COLOR.blue

  return (
    <button
      onClick={() => navigate(`/agents/${agent.id}`)}
      className={`w-full text-left rounded-2xl border-2 p-6 transition-all duration-200 cursor-pointer ${colorClass} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
      aria-label={`Open ${agent.name} agent`}
    >
      <div className="flex items-start gap-4">
        <span className={`text-4xl ${iconColor}`} aria-hidden="true">
          {agent.icon}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{agent.name}</h3>
          <p className="mt-1 text-sm text-gray-600 leading-relaxed line-clamp-3">
            {agent.description}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center text-xs text-gray-500 gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        <span>Online · {agent.apiUrl}</span>
      </div>
    </button>
  )
}
