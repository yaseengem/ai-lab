export type AgentId = 'claims' | 'underwriting' | 'loan'
export type Role = 'end_user' | 'support_exec' | 'admin'

export interface AgentConfig {
  id: AgentId
  name: string
  description: string
  cardDescription?: string  // short (<=140 char) marketplace-card blurb; falls back to description
  color: string   // Tailwind color name, e.g. "blue"
  icon: string    // emoji
  apiUrl: string
}
