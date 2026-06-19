import type { Role } from './agent'
import type { SessionStatus, SessionSummary, FileRef } from './session'

export type { SessionStatus, SessionSummary, FileRef }

// ── requests ──────────────────────────────────────────────────────────────────

export interface PostChatRequest {
  message: string
  role: Role
  user_id: string
  file_ref?: string
}

export interface ApproveRequest {
  approver_id: string
  notes?: string
  override_decision?: string
  override_amount?: string
}

export interface RejectRequest {
  approver_id: string
  reason: string
}

// ── responses ─────────────────────────────────────────────────────────────────

export interface CreateSessionResponse {
  session_id: string
  case_id: string
  role: string
  user_id: string
  status: string
  created_at: string
  updated_at: string
}

// ── SSE event types ───────────────────────────────────────────────────────────

export interface SSETextDelta {
  type: 'text-delta'
  content: string
}

export interface SSEToolStatus {
  type: 'tool-status'
  tool: string
  status: 'running' | 'done' | 'error'
}

export interface SSEDone {
  type: 'done'
}

export interface SSEError {
  type: 'error'
  message: string
}

export type SSEEvent = SSETextDelta | SSEToolStatus | SSEDone | SSEError

// ── API client interface ──────────────────────────────────────────────────────

export interface ApiClient {
  postCreateSession(role: Role, userId: string): Promise<CreateSessionResponse>
  postUpload(file: File, caseId?: string, userId?: string, sessionId?: string): Promise<FileRef>
  postChat(
    sessionId: string,
    request: PostChatRequest,
    onEvent: (event: SSEEvent) => void,
  ): Promise<void>
  getStatus(sessionId: string): Promise<SessionStatus>
  postApprove(caseId: string, request: ApproveRequest): Promise<void>
  postReject(caseId: string, request: RejectRequest): Promise<void>
  getSessions(filters?: {
    status?: string
    role?: string
    user_id?: string
  }): Promise<SessionSummary[]>
}
