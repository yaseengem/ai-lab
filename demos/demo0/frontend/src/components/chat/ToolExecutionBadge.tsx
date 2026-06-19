/**
 * ToolExecutionBadge — pill badge showing tool name + running/done/error state.
 */

import type { ToolEvent } from '@/types/session'

const TOOL_LABELS: Record<string, string> = {
  document_parser: 'Parse Document',
  read_case_status: 'Read Case Status',
  read_case_analysis: 'Read Analysis',
  read_decision_log: 'Read Decision Log',
  search_cases: 'Search Cases',
  write_analysis_result: 'Write Analysis',
  write_decision_log: 'Write Decision Log',
}

interface ToolExecutionBadgeProps {
  event: ToolEvent
}

export function ToolExecutionBadge({ event }: ToolExecutionBadgeProps) {
  const label = TOOL_LABELS[event.tool] ?? event.tool

  const icon =
    event.status === 'running' ? (
      <svg
        className="animate-spin h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
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
    ) : event.status === 'done' ? (
      <span aria-label="done">✓</span>
    ) : (
      <span aria-label="error">✗</span>
    )

  const colorClass =
    event.status === 'running'
      ? 'bg-blue-100 text-blue-700'
      : event.status === 'done'
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700'

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}
    >
      {icon}
      {label}
    </span>
  )
}
