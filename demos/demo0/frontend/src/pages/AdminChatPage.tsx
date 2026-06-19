/**
 * AdminChatPage — administrator view.
 *
 * Route: /agents/:agentId/admin
 *
 * Chat with role='admin' — full access to all cases, policies, audit logs,
 * and the ability to approve, reject, or override decisions via Calvin.
 * A default admin session is created on mount.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { AgentId } from '@/types/agent'
import { getAgent } from '@/config/agents'
import { getApiClient } from '@/api/client'
import { useChat } from '@/hooks/useChat'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { ChatInputArea } from '@/components/chat/ChatInputArea'

export function AdminChatPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const agent = agentId ? getAgent(agentId as AgentId) : null

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)

  // Create an admin session on mount
  useEffect(() => {
    if (!agentId) return
    getApiClient(agentId as AgentId)
      .postCreateSession('admin', 'admin')
      .then((res) => setSessionId(res.session_id))
      .catch(() => setSessionError('Failed to start admin session'))
  }, [agentId])

  const { messages, isStreaming, error: chatError, sendMessage } = useChat(
    agentId as AgentId,
    sessionId,
    'admin',
  )

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-gray-500">Agent not found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full p-4 sm:p-6 gap-4">
      <h2 className="text-lg font-semibold text-gray-900 flex-shrink-0">
        {agent.name} — Admin
      </h2>

      {(sessionError || chatError) && (
        <p className="text-xs text-red-600 text-center flex-shrink-0">
          {sessionError ?? chatError}
        </p>
      )}

      {!sessionId && !sessionError && (
        <p className="text-xs text-gray-400 text-center py-4 flex-shrink-0">
          Starting admin session…
        </p>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {sessionId && messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 py-8">
            Admin session ready. Review cases, approve or override decisions, query any data.
          </p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {sessionId && (
        <div className="flex-shrink-0">
          <ChatInputArea
            onSend={sendMessage}
            isStreaming={isStreaming}
            placeholder="Query cases, approve or reject decisions…"
          />
        </div>
      )}

      {sessionId && (
        <p className="text-xs text-gray-400 text-center flex-shrink-0">
          Session: <span className="font-mono">{sessionId.slice(0, 20)}…</span>
        </p>
      )}
    </div>
  )
}
