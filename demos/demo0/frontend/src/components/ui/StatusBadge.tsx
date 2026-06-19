/**
 * StatusBadge — color-coded pill for WorkflowStatus values.
 */

import type { WorkflowStatus } from '@/types/session'

interface StatusBadgeProps {
  status: WorkflowStatus | null
}

const CONFIG: Record<
  WorkflowStatus,
  { label: string; className: string; spinner?: boolean; pulse?: boolean }
> = {
  INITIATED: {
    label: 'Initiated',
    className: 'bg-gray-100 text-gray-600',
  },
  PROCESSING: {
    label: 'Processing',
    className: 'bg-blue-100 text-blue-700',
    spinner: true,
  },
  PENDING_HUMAN_APPROVAL: {
    label: 'Awaiting Approval',
    className: 'bg-amber-100 text-amber-700',
    pulse: true,
  },
  APPROVED: {
    label: 'Approved',
    className: 'bg-green-100 text-green-700',
  },
  CLOSING: {
    label: 'Closing',
    className: 'bg-blue-100 text-blue-700',
    spinner: true,
  },
  CLOSED: {
    label: 'Closed',
    className: 'bg-green-100 text-green-700',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-700',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-gray-100 text-gray-500',
  },
  ERROR: {
    label: 'Error',
    className: 'bg-red-100 text-red-700',
  },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-400">
        —
      </span>
    )
  }

  const cfg = CONFIG[status]

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cfg.className}`}
    >
      {cfg.spinner && (
        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      )}
      {cfg.pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}
      {cfg.label}
    </span>
  )
}
