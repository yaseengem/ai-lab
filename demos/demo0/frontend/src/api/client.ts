/**
 * API client factory.
 *
 * Returns a mock implementation when VITE_USE_MOCK_API=true,
 * or a real fetch-based implementation that talks to the FastAPI backends.
 */

import type { AgentId, Role } from '@/types/agent'
import type {
  ApiClient,
  ApproveRequest,
  CreateSessionResponse,
  FileRef,
  PostChatRequest,
  RejectRequest,
  SSEEvent,
} from '@/types/api'
import type { SessionStatus, SessionSummary } from '@/types/session'
import { AGENTS } from '@/config/agents'
import { createMockClient } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true'

// ── real fetch-based client ───────────────────────────────────────────────────

function createRealClient(agentId: AgentId): ApiClient {
  const agent = AGENTS.find((a) => a.id === agentId)
  if (!agent) throw new Error(`Unknown agentId: ${agentId}`)
  const base = agent.apiUrl.replace(/\/$/, '')

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`API ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  return {
    postCreateSession: (role: Role, userId: string) => {
      const params = new URLSearchParams({ role, user_id: userId })
      return apiFetch<CreateSessionResponse>(`/sessions?${params}`, { method: 'POST' })
    },

    async postUpload(file: File, caseId?: string, userId = 'anonymous', sessionId?: string): Promise<FileRef> {
      const form = new FormData()
      form.append('file', file)
      form.append('user_id', userId)
      if (caseId) form.append('case_id', caseId)
      if (sessionId) form.append('session_id', sessionId)
      const res = await fetch(`${base}/upload`, { method: 'POST', body: form })
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
      return res.json() as Promise<FileRef>
    },

    async postChat(
      sessionId: string,
      req: PostChatRequest,
      onEvent: (e: SSEEvent) => void,
    ): Promise<void> {
      const res = await fetch(`${base}/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      })
      if (!res.ok) throw new Error(`Chat failed: ${res.status}`)
      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim()
            if (!raw) continue
            try {
              onEvent(JSON.parse(raw) as SSEEvent)
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    },

    getStatus: (sessionId: string) =>
      apiFetch<SessionStatus>(`/status/${sessionId}`),

    postApprove: (caseId: string, req: ApproveRequest) =>
      apiFetch<void>(`/approve/${caseId}`, { method: 'POST', body: JSON.stringify(req) }),

    postReject: (caseId: string, req: RejectRequest) =>
      apiFetch<void>(`/reject/${caseId}`, { method: 'POST', body: JSON.stringify(req) }),

    getSessions: (filters?) => {
      const params = new URLSearchParams()
      if (filters?.status) params.set('status', filters.status)
      if (filters?.role) params.set('role', filters.role)
      if (filters?.user_id) params.set('user_id', filters.user_id)
      const qs = params.toString()
      return apiFetch<SessionSummary[]>(`/sessions${qs ? `?${qs}` : ''}`)
    },
  }
}

// ── public factory ────────────────────────────────────────────────────────────

const _cache = new Map<AgentId, ApiClient>()

export function getApiClient(agentId: AgentId): ApiClient {
  if (!_cache.has(agentId)) {
    _cache.set(agentId, USE_MOCK ? createMockClient(agentId) : createRealClient(agentId))
  }
  return _cache.get(agentId)!
}
