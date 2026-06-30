/**
 * Typed fetch client for the agentx v2 backend canonical contract.
 * Base URL = VITE_API_URL (see config.ts) — never hardcoded here.
 *
 * Two streaming styles per the contract:
 *  - chat  : POST + SSE-formatted body → use fetch + ReadableStream reader
 *            (EventSource cannot issue a POST).
 *  - monitor: GET SSE → use native EventSource (auto-reconnect, honours
 *            Last-Event-ID).
 */
import { API } from '../config'
import { getToken, handleUnauthorized } from '../auth'

// ── Auth header (SES email-OTP gate) ─────────────────────────────────────────

/** Verified-session header sent on gated calls (chat, run, voice). */
export function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { 'X-Auth-Token': t } : {}
}

// ── Core fetch helper ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized()
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ── Contract types ──────────────────────────────────────────────────────────

export interface PingCheck {
  name: string
  ok: boolean
  detail?: string
}
export interface Ping {
  status: 'ok' | 'degraded'
  agent: string
  version: string
  checks: PingCheck[]
}

export interface Persona {
  id: string
  label: string
  icon: string
  description: string
  visible_pages: string[]
  default_landing: string
}
export interface PersonasResponse {
  personas: Persona[]
}

export interface Capability {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  [k: string]: unknown
}
/**
 * An external system the agent can connect to. The platform Config page renders
 * a Connect button per entry; this agent UI shows connected status read-only.
 */
export interface Integration {
  id: string
  name: string
  category?: string
  description?: string
  auth_type?: string
  auth_url?: string
  connected?: boolean
}
export interface AgentConfig {
  personas: Persona[]
  defaults: Record<string, unknown>
  features: Record<string, unknown>
  capabilities: Capability[] | Record<string, unknown>
  integrations?: Integration[]
}

export interface ArchitectureResponse {
  markdown: string
}

export interface MemoryResponse {
  memory: unknown
}

export interface SessionRow {
  session_id: string
  run_id: string | null
  status: string
  persona: string
  created_at: string
  completed_at?: string | null
  event_count?: number
  trigger_mode?: string
}
export interface SessionsResponse {
  sessions: SessionRow[]
}

export interface StartRunBody {
  persona: string
  scenario_id?: string
  payload?: Record<string, unknown>
}
export interface StartRunResponse {
  session_id: string
  run_id: string
  status: string
}

export interface ApprovalResponse {
  status: string // includes "approvals-disabled" when HITL off
}

export interface ScenarioExpected {
  assertions?: string[]
  [k: string]: unknown
}
export interface Scenario {
  id: string
  name: string
  description: string
  tags: string[]
  expected: ScenarioExpected
}
export interface ScenariosResponse {
  scenarios: Scenario[]
}
export interface RunScenarioResponse {
  session_id: string
  run_id: string
}

// ── Generic streamed event (monitor / test) ──────────────────────────────────

export interface MonitorEvent {
  id?: string
  type: string // pipeline-step | status-change | log | test-result | done | error
  _ts?: string
  [k: string]: unknown
}

// ── Authentication (SES email-OTP) ────────────────────────────────────────────

export interface AuthRequestResult {
  ok: boolean
  reason?: string
  ttl_minutes?: number
  delivery?: 'ses' | 'dev'
  dev_code?: string
  ses_error?: string
}
export interface AuthVerifyResult {
  ok: boolean
  reason?: string
  token?: string
  email?: string
  attempts_left?: number
}
export interface AuthStatus {
  verified: boolean
  email?: string
}

export const requestOtp = (email: string) =>
  apiFetch<AuthRequestResult>('/auth/request', { method: 'POST', body: JSON.stringify({ email }) })
export const verifyOtp = (email: string, code: string) =>
  apiFetch<AuthVerifyResult>('/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) })
export const authStatus = () => apiFetch<AuthStatus>('/auth/status')

// ── Voice (Nova Sonic) WebSocket URL ──────────────────────────────────────────

/** Build the ws(s):// URL for the bidirectional voice stream, carrying the token + persona. */
export function voiceWsUrl(sessionId: string, persona: string): string {
  const base = API.replace(/^http/, 'ws')
  const params = new URLSearchParams({ token: getToken() ?? '', persona })
  return `${base}/voice/${encodeURIComponent(sessionId)}?${params.toString()}`
}

// ── Plain endpoints ──────────────────────────────────────────────────────────

export const ping = () => apiFetch<Ping>('/ping')
export const getConfig = () => apiFetch<AgentConfig>('/config')
export const getPersonas = () => apiFetch<PersonasResponse>('/personas')
export const getArchitecture = () => apiFetch<ArchitectureResponse>('/architecture')
export const getMemory = () => apiFetch<MemoryResponse>('/memory')

export const listSessions = () => apiFetch<SessionsResponse>('/sessions')
export const getSession = (id: string) =>
  apiFetch<SessionRow>(`/sessions/${encodeURIComponent(id)}`)

export const startRun = (body: StartRunBody) =>
  apiFetch<StartRunResponse>('/run', { method: 'POST', body: JSON.stringify(body) })

export const approve = (id: string) =>
  apiFetch<ApprovalResponse>(`/approve/${encodeURIComponent(id)}`, { method: 'POST' })
export const reject = (id: string) =>
  apiFetch<ApprovalResponse>(`/reject/${encodeURIComponent(id)}`, { method: 'POST' })

export const listScenarios = () => apiFetch<ScenariosResponse>('/test/scenarios')
export const runScenario = (id: string) =>
  apiFetch<RunScenarioResponse>(`/test/run/${encodeURIComponent(id)}`, { method: 'POST' })

// ── Chat: POST + SSE body (ReadableStream reader) ─────────────────────────────

export interface ChatDelta {
  type: 'text-delta' | 'done' | 'error' | string
  content?: string
  [k: string]: unknown
}

/**
 * Stream a chat turn. The backend replies with `data: {json}` lines terminated
 * by a `{type:"done"}` event. Yields each parsed payload.
 */
export async function* streamChat(
  sessionId: string,
  message: string,
  persona: string,
  userId = 'anonymous',
): AsyncGenerator<ChatDelta> {
  const res = await fetch(`${API}/chat/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ message, persona, user_id: userId }),
  })
  if (!res.ok || !res.body) {
    if (res.status === 401) handleUnauthorized()
    throw new Error(`Chat failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        yield JSON.parse(data) as ChatDelta
      } catch {
        /* ignore malformed line */
      }
    }
  }
}

// ── Monitor: GET SSE via native EventSource ───────────────────────────────────

/**
 * Open a live monitor stream for a session. Native EventSource auto-reconnects
 * and replays via Last-Event-ID. Returns the EventSource so the caller can
 * `.close()` it; remember to close on unmount and on done/error.
 */
export function openMonitor(sessionId: string): EventSource {
  return new EventSource(`${API}/monitor/${encodeURIComponent(sessionId)}`)
}
