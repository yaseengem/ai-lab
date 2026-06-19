/**
 * Mock API layer — simulates all backend endpoints so the frontend can be
 * developed and demoed without a running backend.
 *
 * Toggle with: VITE_USE_MOCK_API=true in frontend/.env
 */

import type {
  ApiClient,
  ApproveRequest,
  CreateSessionResponse,
  FileRef,
  PostChatRequest,
  RejectRequest,
  SSEEvent,
} from '@/types/api'
import type { SessionStatus, SessionSummary, WorkflowStatus } from '@/types/session'
import type { AgentId, Role } from '@/types/agent'

// ── per-agent mock case IDs ───────────────────────────────────────────────────
const MOCK_CASE: Record<AgentId, string> = {
  claims: 'CLAIM-001',
  underwriting: 'UW-001',
  loan: 'LOAN-001',
}

// ── session status store (module-level, shared across mock calls) ─────────────
const _statusStore = new Map<string, WorkflowStatus>()
const _statusTimers = new Map<string, ReturnType<typeof setTimeout>>()

function _initSession(sessionId: string) {
  if (!_statusStore.has(sessionId)) {
    _statusStore.set(sessionId, 'PROCESSING')
    // Transition to PENDING_HUMAN_APPROVAL after 5 s
    const timer = setTimeout(() => {
      if (_statusStore.get(sessionId) === 'PROCESSING') {
        _statusStore.set(sessionId, 'PENDING_HUMAN_APPROVAL')
      }
      _statusTimers.delete(sessionId)
    }, 5000)
    _statusTimers.set(sessionId, timer)
  }
}

// ── mock response text snippets (per agent) ──────────────────────────────────
const MOCK_RESPONSES: Record<AgentId, string[]> = {
  claims: [
    'I have reviewed your claim and all documentation looks complete. ',
    'The claim amount of $2,500 falls within the auto-approval threshold. ',
    'I am submitting this for final supervisor review. ',
    'You should receive a decision within 24 hours.',
  ],
  underwriting: [
    'I have assessed the risk profile for this application. ',
    'Based on the submitted documents, the risk score is moderate. ',
    'I recommend approval with standard premium rates. ',
    'The policy will be issued upon supervisor confirmation.',
  ],
  loan: [
    'I have reviewed your loan application. ',
    'Your credit profile meets our lending criteria. ',
    'I am recommending approval for the requested amount. ',
    'Final disbursement is subject to supervisor sign-off.',
  ],
}

// ── delay helper ──────────────────────────────────────────────────────────────
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ── mock implementation ───────────────────────────────────────────────────────

export function createMockClient(agentId: AgentId): ApiClient {
  const caseId = MOCK_CASE[agentId]
  const sessionId = `mock-session-${agentId}-001`
  _initSession(sessionId)

  return {
    // POST /sessions
    async postCreateSession(_role: Role, _userId: string): Promise<CreateSessionResponse> {
      await delay(200)
      _initSession(sessionId)
      return {
        session_id: sessionId,
        case_id: caseId,
        role: _role,
        user_id: _userId,
        status: 'INITIATED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    },

    // POST /upload
    async postUpload(_file: File, _caseId?: string): Promise<FileRef> {
      await delay(1000)
      return {
        file_ref: `${caseId}/mock-document.pdf`,
        case_id: caseId,
        session_id: sessionId,
      }
    },

    // POST /chat/{sessionId}  (SSE simulation)
    async postChat(
      _sessionId: string,
      _req: PostChatRequest,
      onEvent: (event: SSEEvent) => void,
    ): Promise<void> {
      const words = MOCK_RESPONSES[agentId].join('').split(' ')
      let wordIndex = 0

      return new Promise<void>((resolve) => {
        // Emit tool-status first
        setTimeout(() => {
          onEvent({ type: 'tool-status', tool: 'read_case_status', status: 'running' })
        }, 100)
        setTimeout(() => {
          onEvent({ type: 'tool-status', tool: 'read_case_status', status: 'done' })
        }, 400)

        // Stream words at 50 ms intervals
        const interval = setInterval(() => {
          if (wordIndex < words.length) {
            const token = (wordIndex === 0 ? '' : ' ') + words[wordIndex]
            onEvent({ type: 'text-delta', content: token })
            wordIndex++
          } else {
            clearInterval(interval)
            onEvent({ type: 'done' })
            resolve()
          }
        }, 50)
      })
    },

    // GET /status/{sessionId}
    async getStatus(_sessionId: string): Promise<SessionStatus> {
      await delay(50)
      const status = _statusStore.get(sessionId) ?? 'PROCESSING'
      return {
        session_id: sessionId,
        case_id: caseId,
        status,
        role: 'end_user',
        user_id: 'mock-user',
        created_at: new Date(Date.now() - 60000).toISOString(),
        updated_at: new Date().toISOString(),
      }
    },

    // POST /approve/{caseId}
    async postApprove(_caseId: string, _req: ApproveRequest): Promise<void> {
      await delay(100)
      _statusStore.set(sessionId, 'APPROVED')
    },

    // POST /reject/{caseId}
    async postReject(_caseId: string, _req: RejectRequest): Promise<void> {
      await delay(100)
      _statusStore.set(sessionId, 'REJECTED')
    },

    // GET /sessions
    async getSessions(): Promise<SessionSummary[]> {
      await delay(100)
      return [
        {
          session_id: sessionId,
          case_id: caseId,
          status: _statusStore.get(sessionId) ?? 'PROCESSING',
          role: 'end_user',
          user_id: 'mock-user',
          created_at: new Date(Date.now() - 120000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          session_id: `mock-session-${agentId}-002`,
          case_id: caseId.replace('001', '002'),
          status: 'CLOSED',
          role: 'end_user',
          user_id: 'mock-user-2',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 1800000).toISOString(),
        },
        {
          session_id: `mock-session-${agentId}-003`,
          case_id: caseId.replace('001', '003'),
          status: 'PENDING_HUMAN_APPROVAL',
          role: 'end_user',
          user_id: 'mock-user-3',
          created_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
        },
      ]
    },
  }
}
