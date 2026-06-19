import type { AgentConfig, AgentId } from '@/types/agent'

export const AGENTS: AgentConfig[] = [
  {
    id: 'claims',
    name: 'Claims Processing',
    description: 'Submit and track insurance claims, upload documents, and get status updates.',
    color: 'blue',
    icon: '📋',
    apiUrl: import.meta.env.VITE_CLAIMS_API_URL ?? 'http://localhost:8001',
  },
  {
    id: 'underwriting',
    name: 'Underwriting',
    description: 'Risk assessment and policy underwriting decisions.',
    color: 'green',
    icon: '📊',
    apiUrl: import.meta.env.VITE_UNDERWRITING_API_URL ?? 'http://localhost:8002',
  },
  {
    id: 'loan',
    name: 'Loan Processing',
    description: 'Apply for loans, track applications, and review decisions.',
    color: 'purple',
    icon: '💰',
    apiUrl: import.meta.env.VITE_LOAN_API_URL ?? 'http://localhost:8003',
  },
]

export function getAgent(id: AgentId): AgentConfig {
  const agent = AGENTS.find((a) => a.id === id)
  if (!agent) throw new Error(`Unknown agent id: ${id}`)
  return agent
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  end_user: 'Submit documents, ask about your case, track progress.',
  support_exec: 'Query any case, view decisions, approve or reject claims via chat.',
  admin: 'Full access to all cases, audit logs, and approval actions.',
}
