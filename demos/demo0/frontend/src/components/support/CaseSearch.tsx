/**
 * CaseSearch — input + "Load Case" button for the support view.
 *
 * Validates the session ID by calling GET /status/{sessionId}.
 * Fires onSessionLoad(sessionId) on success.
 */

import { useState, FormEvent } from 'react'
import type { AgentId } from '@/types/agent'
import { getApiClient } from '@/api/client'

interface CaseSearchProps {
  agentId: AgentId
  onSessionLoad: (sessionId: string) => void
}

export function CaseSearch({ agentId, onSessionLoad }: CaseSearchProps) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const id = value.trim()
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      // Validate session exists
      await getApiClient(agentId).getStatus(id)
      onSessionLoad(id)
    } catch {
      setError(`Session "${id}" not found or unavailable.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter session ID (e.g. CLAIM-001-abc…)"
          className="flex-1 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading…' : 'Load Case'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
