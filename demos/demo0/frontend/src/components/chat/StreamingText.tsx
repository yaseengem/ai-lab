/**
 * StreamingText — renders text with a blinking cursor when streaming.
 */

interface StreamingTextProps {
  content: string
  isStreaming?: boolean
}

export function StreamingText({ content, isStreaming }: StreamingTextProps) {
  return (
    <span>
      {content}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 ml-0.5 bg-current align-middle animate-pulse">
          ▋
        </span>
      )}
    </span>
  )
}
