/**
 * ChatInputArea — auto-growing textarea.
 *
 * Enter submits; Shift+Enter inserts a newline.
 * Disabled while isStreaming=true.
 */

import { useCallback, useRef, KeyboardEvent, ChangeEvent } from 'react'

interface ChatInputAreaProps {
  onSend: (text: string) => void
  isStreaming: boolean
  placeholder?: string
}

export function ChatInputArea({
  onSend,
  isStreaming,
  placeholder = 'Type a message…',
}: ChatInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    // Max 5 rows ≈ 5 * 24px line-height + padding
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    resize()
    // onChange not needed for controlled input — we read value on submit
    void e
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = () => {
    const el = textareaRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text || isStreaming) return
    onSend(text)
    el.value = ''
    el.style.height = 'auto'
  }

  return (
    <div className="flex items-end gap-2 border-t border-gray-200 bg-white p-3">
      <textarea
        ref={textareaRef}
        rows={1}
        disabled={isStreaming}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 resize-none rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
        style={{ minHeight: '40px' }}
      />
      <button
        onClick={submit}
        disabled={isStreaming}
        aria-label="Send message"
        className="flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isStreaming ? (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
        ) : (
          'Send'
        )}
      </button>
    </div>
  )
}
