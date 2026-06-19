/**
 * AgentListPage — home screen showing all available agents.
 *
 * Route: /
 */

import { AGENTS } from '@/config/agents'
import { AgentCard } from '@/components/agent/AgentCard'

export function AgentListPage() {
  return (
    <div className="flex-1 p-6 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Neural</h1>
          <p className="mt-2 text-gray-500">
            Multi-agent AI platform for financial services. Choose an agent to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {AGENTS.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
    </div>
  )
}
