/**
 * UserChatPage — customer-facing chat page.
 *
 * Route: /agents/:agentId/user
 *
 * Chatbot-first: a session is created on mount so chat is available
 * immediately.  The paperclip button lets the customer optionally attach a
 * document; after upload the agent receives the file_ref and processes it.
 * ApprovalBanner appears when status = PENDING_HUMAN_APPROVAL.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { AgentId } from '@/types/agent'
import type { FileRef } from '@/types/session'
import { getAgent } from '@/config/agents'
import { useChat } from '@/hooks/useChat'
import { useAgentStatus } from '@/hooks/useAgentStatus'
import { getApiClient } from '@/api/client'
import { FileUpload } from '@/components/chat/FileUpload'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInputArea } from '@/components/chat/ChatInputArea'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function UserChatPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const agent = agentId ? getAgent(agentId as AgentId) : null

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [caseId, setCaseId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  const { messages, isStreaming, error: chatError, sendMessage } = useChat(
    agentId as AgentId,
    sessionId,
    'end_user',
  )
  const { status } = useAgentStatus(agentId as AgentId, sessionId)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Create session immediately on mount so chat is available right away
  useEffect(() => {
    if (!agentId) return
    getApiClient(agentId as AgentId)
      .postCreateSession('end_user', 'customer')
      .then((res) => {
        setSessionId(res.session_id)
        setCaseId(res.case_id)
      })
      .catch(() => setSessionError('Failed to start session. Is the backend running?'))
  }, [agentId])

  // After a document is uploaded, send it to the agent for processing
  const handleUploaded = useCallback(
    (ref: FileRef) => {
      setShowUpload(false)
      const filename = ref.file_ref.split('/').pop() ?? ref.file_ref
      sendMessage(
        `I have uploaded my document "${filename}". Please review and process it.`,
        ref.file_ref,
      )
    },
    [sendMessage],
  )

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-gray-500">Agent not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full p-4 sm:p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900">{agent.name} — Customer Chat</h2>
        {sessionId && <StatusBadge status={status} />}
      </div>

      {/* Errors */}
      {(sessionError || chatError) && (
        <p className="text-xs text-red-600 text-center flex-shrink-0">
          {sessionError ?? chatError}
        </p>
      )}

      {/* Session initialising */}
      {!sessionId && !sessionError && (
        <p className="text-xs text-gray-400 text-center py-4 flex-shrink-0">
          Starting session…
        </p>
      )}

      {/* Pending review notice (informational only — approval happens via support chat) */}
      {sessionId && status === 'PENDING_HUMAN_APPROVAL' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
          <span className="relative flex h-3 w-3 mt-0.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Under Review</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your case has been reviewed by the AI and is awaiting a decision from our team.
              You will be notified once a decision is made.
            </p>
          </div>
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {sessionId && messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Session ready. Ask any questions about your case, or attach a document using the
            paperclip button below.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Collapsible document upload panel */}
      {sessionId && showUpload && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Attach a document</p>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-400 hover:text-gray-600 transition"
              aria-label="Close upload panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <FileUpload
            agentId={agentId as AgentId}
            caseId={caseId ?? undefined}
            onUploaded={handleUploaded}
          />
        </div>
      )}

      {/* Input row — attach button + chat area */}
      {sessionId && (
        <div className="flex items-end gap-2 flex-shrink-0">
          <button
            onClick={() => setShowUpload((v) => !v)}
            disabled={isStreaming}
            title="Attach document"
            className={`flex-shrink-0 p-2 rounded-xl border transition ${
              showUpload
                ? 'border-blue-500 bg-blue-50 text-blue-600'
                : 'border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            } disabled:opacity-40`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <div className="flex-1">
            <ChatInputArea
              onSend={sendMessage}
              isStreaming={isStreaming}
              placeholder="Ask about your case…"
            />
          </div>
        </div>
      )}

      {/* Session info footer */}
      {caseId && sessionId && (
        <p className="text-xs text-gray-400 text-center flex-shrink-0">
          Case: <span className="font-mono">{caseId}</span> ·{' '}
          Session: <span className="font-mono">{sessionId.slice(0, 16)}…</span>
        </p>
      )}
    </div>
  )
}
