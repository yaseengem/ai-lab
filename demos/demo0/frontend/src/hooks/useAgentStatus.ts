/**
 * useAgentStatus — polls GET /status/{sessionId} every 5 s.
 *
 * Stops polling automatically when the workflow reaches a terminal state
 * (CLOSED, REJECTED, EXPIRED, ERROR).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentId } from '@/types/agent'
import type { SessionStatus, WorkflowStatus } from '@/types/session'
import { getApiClient } from '@/api/client'

const TERMINAL: Set<WorkflowStatus> = new Set(['CLOSED', 'REJECTED', 'EXPIRED', 'ERROR'])
const POLL_INTERVAL_MS = 5000

interface UseAgentStatusReturn {
  status: WorkflowStatus | null
  sessionData: SessionStatus | null
  lastUpdated: string | null
  error: string | null
  refresh: () => void
}

export function useAgentStatus(
  agentId: AgentId,
  sessionId: string | null,
): UseAgentStatusReturn {
  const [sessionData, setSessionData] = useState<SessionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    if (!sessionId) return
    try {
      const data = await getApiClient(agentId).getStatus(sessionId)
      setSessionData(data)
      setError(null)
      // Stop polling on terminal status
      if (TERMINAL.has(data.status) && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status poll failed')
    }
  }, [agentId, sessionId])

  useEffect(() => {
    if (!sessionId) return
    // Immediate first poll
    poll()
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sessionId, poll])

  return {
    status: sessionData?.status ?? null,
    sessionData,
    lastUpdated: sessionData?.updated_at ?? null,
    error,
    refresh: poll,
  }
}
