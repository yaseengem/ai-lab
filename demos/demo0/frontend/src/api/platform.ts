/**
 * Platform API client — talks to the AI Agents Squad backend (:8002).
 * Used by marketplace pages to list/detail agents dynamically.
 */

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API_URL ?? 'http://localhost:8002'

export interface PlatformAgent {
  id: string
  name: string
  description: string
  card_description?: string | null
  icon?: string | null
  use_case: string
  domain: string
  api_port: number
  frontend_port: number
  status: 'active' | 'stub' | 'template'
  version: string
  live_status: 'online' | 'offline' | 'unknown'
}

export async function fetchAgents(): Promise<PlatformAgent[]> {
  const res = await fetch(`${PLATFORM_API}/api/agents`)
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`)
  return res.json()
}

/**
 * Live status per agent: { [agentId]: 'online' | 'offline' }.
 * Fetched separately so the agent list can render before health probes finish.
 */
export async function fetchAgentStatuses(): Promise<Record<string, PlatformAgent['live_status']>> {
  const res = await fetch(`${PLATFORM_API}/api/agents/status`)
  if (!res.ok) throw new Error(`Failed to fetch agent statuses: ${res.status}`)
  return res.json()
}

export async function fetchAgent(id: string): Promise<PlatformAgent> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}`)
  if (!res.ok) throw new Error(`Agent not found: ${id}`)
  return res.json()
}

export async function fetchHealth(): Promise<{ status: string; agents_found: number }> {
  const res = await fetch(`${PLATFORM_API}/api/health`)
  if (!res.ok) throw new Error('Health check failed')
  return res.json()
}

// ── per-agent config + restart ──────────────────────────────────────────────

/** Arbitrary YAML-ish config object; must contain a `personas` array to save. */
export type AgentConfigDoc = Record<string, unknown>

/** GET the agent's agent.config.yaml as JSON. Throws on 404 (no config file). */
export async function fetchAgentConfig(id: string): Promise<AgentConfigDoc> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}/config`)
  if (!res.ok) throw new Error(`No config for agent: ${id} (${res.status})`)
  return res.json()
}

/** PUT a new config. Works even when the agent process is offline. */
export async function saveAgentConfig(id: string, config: AgentConfigDoc): Promise<void> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save config (${res.status}): ${text}`)
  }
}

/** POST a restart. Returns {status, running}: running=true means it was live. */
export async function restartAgent(
  id: string,
): Promise<{ status: string; running: boolean }> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}/restart`, {
    method: 'POST',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Restart failed (${res.status}): ${text}`)
  }
  return res.json()
}
