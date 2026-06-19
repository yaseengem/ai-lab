/**
 * Platform API client — talks to the AI Agents Squad backend (:8002).
 * Used by marketplace pages to list/detail agents dynamically.
 */

const PLATFORM_API = import.meta.env.VITE_PLATFORM_API_URL ?? 'http://localhost:8002'

export interface PlatformAgent {
  id: string
  name: string
  description: string
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
