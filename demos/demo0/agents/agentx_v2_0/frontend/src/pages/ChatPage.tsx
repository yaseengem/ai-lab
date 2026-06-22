import { useEffect, useRef, useState } from 'react'
import { streamChat } from '../api/client'
import { getPersona } from '../persona'

/** '/chat' — DEFAULT LANDING. Persona-aware operational chat over SSE. */

interface Msg {
  role: 'user' | 'agent'
  text: string
}

// One session per browser tab so chat history persists across page switches.
function useChatSessionId(): string {
  const ref = useRef<string>('')
  if (!ref.current) {
    const key = 'agentx:chat-session'
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(key, id)
    }
    ref.current = id
  }
  return ref.current
}

export function ChatPage() {
  const persona = getPersona() || 'user'
  const sessionId = useChatSessionId()

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streaming])

  const send = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setError(null)
    setInput('')
    setMessages(m => [...m, { role: 'user', text }, { role: 'agent', text: '' }])
    setStreaming(true)

    try {
      for await (const ev of streamChat(sessionId, text, persona)) {
        if (ev.type === 'text-delta' && ev.content) {
          setMessages(m => {
            const next = [...m]
            next[next.length - 1] = { role: 'agent', text: next[next.length - 1].text + ev.content }
            return next
          })
        } else if (ev.type === 'error') {
          setError(String(ev.content ?? 'stream error'))
          break
        } else if (ev.type === 'done') {
          break
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setStreaming(false)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '20px 32px 12px', borderBottom: '1px solid var(--b)', background: 'var(--s)' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Chat</h1>
        <p style={{ fontSize: 12, color: 'var(--t2)', margin: '2px 0 0' }}>
          Ask operational questions — runs, memory and rules, config, and status. Acting as <strong>{persona}</strong>.
        </p>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: 560, margin: '40px auto 0', textAlign: 'center', color: 'var(--t2)' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>
              Ask the agent about its operations
            </div>
            <p style={{ fontSize: 13 }}>
              Try: “What runs happened today?”, “What rules are in memory?”, “Is the agent healthy?”,
              or “Why did the last run end the way it did?”
            </p>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%', padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: m.role === 'user' ? 'var(--ac)' : 'var(--s)',
                  color: m.role === 'user' ? '#fff' : 'var(--t)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--b)',
                }}>
                  {m.text || (streaming && i === messages.length - 1
                    ? <span className="cursor-blink" style={{ color: 'var(--t3)' }}>▋</span>
                    : '')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 32px', color: 'var(--rd)', fontSize: 12, background: 'var(--rdd)' }}>{error}</div>
      )}

      <div style={{ padding: '14px 32px', borderTop: '1px solid var(--b)', background: 'var(--s)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask about runs, memory, config or status… (Enter to send, Shift+Enter for newline)"
            style={{
              flex: 1, resize: 'none', padding: '10px 14px', fontFamily: 'inherit', fontSize: 14,
              border: '1px solid var(--b2)', borderRadius: 10, color: 'var(--t)', background: 'var(--s)',
              maxHeight: 140,
            }}
          />
          <button className="btn btn-p" onClick={send} disabled={streaming || !input.trim()}>
            {streaming ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
