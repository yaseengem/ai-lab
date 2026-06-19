/**
 * MessageBubble — renders a single chat message.
 *
 * User messages: right-aligned blue bubble.
 * Assistant messages: left-aligned, content rendered via react-markdown with
 * typography prose styles.  Tool events appear as ToolExecutionBadge pills
 * above the message text.
 */

import ReactMarkdown from 'react-markdown'
import type { Message } from '@/types/session'
import { StreamingText } from './StreamingText'
import { ToolExecutionBadge } from './ToolExecutionBadge'

interface MessageBubbleProps {
  message: Message
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] px-4 py-2 rounded-2xl rounded-tr-sm bg-blue-600 text-white text-sm">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] space-y-2">
        {/* Tool event badges */}
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolEvents.map((evt, i) => (
              <ToolExecutionBadge key={`${evt.tool}-${i}`} event={evt} />
            ))}
          </div>
        )}

        {/* Message content */}
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-gray-100 text-gray-900 text-sm">
          {message.isStreaming && !message.content ? (
            <StreamingText content="" isStreaming />
          ) : (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
              <ReactMarkdown>{message.content}</ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-0.5 h-4 ml-0.5 bg-gray-600 align-middle animate-pulse" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
