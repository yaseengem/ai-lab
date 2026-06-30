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
  template_version?: string | null
  /** True when the agent has an agent.config.yaml with personas. */
  configured?: boolean
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

/**
 * An external system the agent can connect to, rendered as a Connect button on
 * the Configuration tab. If `auth_url` is set the button opens it in a new tab
 * (functional OAuth); if blank it's a mock toggle for the demo.
 */
export interface Integration {
  id: string
  name: string
  category?: 'cloud' | 'data' | 'productivity' | 'business' | string
  description?: string
  auth_type?: 'oauth' | 'apikey' | 'mock' | string
  auth_url?: string
  connected?: boolean
}

/** A declared operator-editable setting, rendered as one input on the Config form. */
export interface SetupField {
  key: string
  label: string
  type: 'string' | 'email' | 'number' | 'boolean' | 'select' | 'list' | string
  help?: string
  group?: string
  options?: string[]
}

/** Arbitrary YAML-ish config object; must contain a `personas` array to save. */
export type AgentConfigDoc = Record<string, unknown> & {
  defaults?: Record<string, unknown>
  features?: Record<string, unknown>
  integrations?: Integration[]
  setup_fields?: SetupField[]
}

/** Operator overrides (state/config/setup.yaml) — a flat map of editable keys. */
export type AgentSetup = Record<string, unknown>

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

/** GET the agent's operator overrides (state/config/setup.yaml). {} when unconfigured. */
export async function fetchAgentSetup(id: string): Promise<AgentSetup> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}/setup`)
  if (!res.ok) throw new Error(`No setup for agent: ${id} (${res.status})`)
  return res.json()
}

/** PUT operator overrides to state/config/setup.yaml. Works even when offline. */
export async function saveAgentSetup(id: string, setup: AgentSetup): Promise<void> {
  const res = await fetch(`${PLATFORM_API}/api/agents/${id}/setup`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(setup),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to save setup (${res.status}): ${text}`)
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
