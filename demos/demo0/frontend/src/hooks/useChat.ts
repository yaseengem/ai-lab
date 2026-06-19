/**
 * useChat — SSE-streaming chat hook.
 *
 * Manages the message list for a single session.  Each call to sendMessage
 * opens a new SSE connection, appends tokens to the last assistant message
 * as they arrive, and closes on the "done" event.
 */

import { useCallback, useRef, useState } from 'react'
import type { AgentId, Role } from '@/types/agent'
import type { SSEEvent } from '@/types/api'
import type { Message, ToolEvent } from '@/types/session'
import { getApiClient } from '@/api/client'

function makeId() {
  return Math.random().toString(36).slice(2)
}

function nowIso() {
  return new Date().toISOString()
}

interface UseChatReturn {
  messages: Message[]
  isStreaming: boolean
  error: string | null
  sendMessage: (text: string, fileRef?: string) => Promise<void>
  clearMessages: () => void
}

export function useChat(
  agentId: AgentId,
  sessionId: string | null,
  role: Role,
): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retryRef = useRef(0)

  const sendMessage = useCallback(
    async (text: string, fileRef?: string) => {
      if (!sessionId || isStreaming) return
      setError(null)

      // Add the user message immediately
      const userMsg: Message = {
        id: makeId(),
        role: 'user',
        content: text,
        timestamp: nowIso(),
      }
      // Placeholder for the streaming assistant message
      const assistantId = makeId()
      const assistantMsg: Message = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: nowIso(),
        isStreaming: true,
        toolEvents: [],
      }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)

      const doRequest = async () => {
        const client = getApiClient(agentId)
        await client.postChat(
          sessionId,
          { message: text, role, user_id: 'demo', file_ref: fileRef },
          (event: SSEEvent) => {
            if (event.type === 'text-delta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m,
                ),
              )
            } else if (event.type === 'tool-status' && role !== 'end_user') {
              const toolEvt: ToolEvent = { tool: event.tool, status: event.status }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolEvents: [...(m.toolEvents ?? []), toolEvt] }
                    : m,
                ),
              )
            } else if (event.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, isStreaming: false } : m,
                ),
              )
              setIsStreaming(false)
              retryRef.current = 0
            } else if (event.type === 'error') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content || `Error: ${event.message}`, isStreaming: false }
                    : m,
                ),
              )
              setIsStreaming(false)
            }
          },
        )
      }

      try {
        await doRequest()
      } catch (err) {
        // Single retry on network error
        if (retryRef.current < 1) {
          retryRef.current++
          try {
            await doRequest()
            return
          } catch {
            // fall through to error state
          }
        }
        const msg = err instanceof Error ? err.message : 'Network error'
        setError(msg)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `Error: ${msg}`, isStreaming: false }
              : m,
          ),
        )
        setIsStreaming(false)
        retryRef.current = 0
      }
    },
    [agentId, sessionId, role, isStreaming],
  )

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, isStreaming, error, sendMessage, clearMessages }
}
