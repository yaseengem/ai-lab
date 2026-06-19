/**
 * ApprovalBanner — amber banner shown when status is PENDING_HUMAN_APPROVAL.
 *
 * Approve button calls POST /approve/{caseId}.
 * Reject button calls POST /reject/{caseId}.
 * Both buttons are disabled while a decision is being submitted.
 */

import { useState } from 'react'
import type { AgentId } from '@/types/agent'
import { getApiClient } from '@/api/client'

interface ApprovalBannerProps {
  agentId: AgentId
  caseId: string
  approverId: string
  onDecision?: (decision: 'approved' | 'rejected') => void
}

export function ApprovalBanner({ agentId, caseId, approverId, onDecision }: ApprovalBannerProps) {
  const [submitting, setSubmitting] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [decided, setDecided] = useState(false)

  const decide = async (action: 'approve' | 'reject') => {
    setSubmitting(true)
    setError(null)
    try {
      const client = getApiClient(agentId)
      if (action === 'approve') {
        await client.postApprove(caseId, { approver_id: approverId, notes: notes || undefined })
        setDecided(true)
        onDecision?.('approved')
      } else {
        await client.postReject(caseId, { approver_id: approverId, reason: notes || 'Rejected by reviewer' })
        setDecided(true)
        onDecision?.('rejected')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit decision')
    } finally {
      setSubmitting(false)
    }
  }

  if (decided) return null

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="relative flex h-3 w-3 mt-0.5 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
        </span>
        <div>
          <p className="text-sm font-semibold text-amber-800">Human Approval Required</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This case has been reviewed by the AI agent and is awaiting your decision.
          </p>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes or reason…"
        rows={2}
        className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
        disabled={submitting}
      />

      <div className="flex gap-2">
        <button
          onClick={() => decide('approve')}
          disabled={submitting}
          className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Submitting…' : 'Approve'}
        </button>
        <button
          onClick={() => decide('reject')}
          disabled={submitting}
          className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Reject
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
