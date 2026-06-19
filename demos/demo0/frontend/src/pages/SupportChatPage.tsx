/**
 * SupportChatPage — support agent view.
 *
 * Route: /agents/:agentId/support
 *
 * Chatbot-first: a session is created on mount so chat is immediately
 * available for general questions (search cases, check stats, etc.).
 * An optional "Load case" panel in the header lets the support agent
 * switch to a specific customer session by ID.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { AgentId } from '@/types/agent'
import { getAgent } from '@/config/agents'
import { getApiClient } from '@/api/client'
import { useChat } from '@/hooks/useChat'
import { useAgentStatus } from '@/hooks/useAgentStatus'
import { CaseSearch } from '@/components/support/CaseSearch'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInputArea } from '@/components/chat/ChatInputArea'
import { StatusBadge } from '@/components/ui/StatusBadge'

export function SupportChatPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const agent = agentId ? getAgent(agentId as AgentId) : null

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  const { messages, isStreaming, error: chatError, sendMessage, clearMessages } = useChat(
    agentId as AgentId,
    sessionId,
    'support_exec',
  )
  const { status } = useAgentStatus(agentId as AgentId, sessionId)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Create a general support session on mount so chat is available immediately
  useEffect(() => {
    if (!agentId) return
    getApiClient(agentId as AgentId)
      .postCreateSession('support_exec', 'support')
      .then((res) => setSessionId(res.session_id))
      .catch(() => setSessionError('Failed to start support session. Is the backend running?'))
  }, [agentId])

  // When a specific customer session is loaded, switch to it
  const handleSessionLoad = useCallback(
    (id: string) => {
      clearMessages()
      setSessionId(id)
      setShowSearch(false)
    },
    [clearMessages],
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
        <h2 className="text-lg font-semibold text-gray-900">{agent.name} — Support</h2>
        <div className="flex items-center gap-3">
          {sessionId && <StatusBadge status={status} />}
          <button
            onClick={() => setShowSearch((v) => !v)}
            title="Load a specific case by session ID"
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              showSearch
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            Load case
          </button>
        </div>
      </div>

      {/* Collapsible case search panel */}
      {showSearch && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 flex-shrink-0">
          <p className="text-xs font-medium text-gray-500 mb-2">
            Enter a session ID to switch context to that customer case
          </p>
          <CaseSearch agentId={agentId as AgentId} onSessionLoad={handleSessionLoad} />
        </div>
      )}

      {/* Errors */}
      {(sessionError || chatError) && (
        <p className="text-xs text-red-600 text-center flex-shrink-0">
          {sessionError ?? chatError}
        </p>
      )}

      {/* Session initialising */}
      {!sessionId && !sessionError && (
        <p className="text-xs text-gray-400 text-center py-4 flex-shrink-0">
          Starting support session…
        </p>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {sessionId && messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Support session ready. Ask about cases, policies, or load a specific case using the
            button above.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {chatError && (
        <p className="text-xs text-red-600 text-center flex-shrink-0">{chatError}</p>
      )}

      {/* Input */}
      {sessionId && (
        <div className="flex-shrink-0">
          <ChatInputArea
            onSend={sendMessage}
            isStreaming={isStreaming}
            placeholder="Ask about cases, policies, or a specific claim…"
          />
        </div>
      )}

      {/* Active session indicator */}
      {sessionId && (
        <p className="text-xs text-gray-400 text-center flex-shrink-0">
          Session: <span className="font-mono">{sessionId.slice(0, 20)}…</span>
        </p>
      )}
    </div>
  )
}
