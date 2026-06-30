import { useEffect, useRef, useState } from 'react'
import { streamChat } from '../api/client'
import { getPersona } from '../persona'
import { handleUnauthorized } from '../auth'
import { VoiceClient } from '../voice/voiceClient'
import { SnowflakeVoice, type SnowflakeHandle } from '../voice/SnowflakeVoice'

/** '/chat' — DEFAULT LANDING. Cross-modal: text (SSE) + voice (Nova Sonic over WS). */

interface Msg {
  role: 'user' | 'agent'
  text: string
}

type VoiceState = 'off' | 'connecting' | 'live'

// One session per browser tab so chat history persists across page switches.
function useChatSessionId(): string {
  const ref = useRef<string>('')
  if (!ref.current) {
    const key = 'agent5:chat-session'
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      sessionStorage.setItem(key, id)
    }
    ref.current = id
  }
  return ref.current
}

// True on narrow (mobile) viewports, kept live via matchMedia.
function useIsMobile(): boolean {
  const query = '(max-width: 768px)'
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

export function ChatPage() {
  const persona = getPersona() || 'visitor'
  const sessionId = useChatSessionId()
  const isMobile = useIsMobile()

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const [voice, setVoice] = useState<VoiceState>('off')
  const [voiceTool, setVoiceTool] = useState<string | null>(null)
  const voiceRef = useRef<VoiceClient | null>(null)
  const snowRef = useRef<SnowflakeHandle | null>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, streaming])

  // Tear the voice session down on unmount.
  useEffect(() => () => { voiceRef.current?.stop() }, [])

  // Mirror the voice state into the snowflake visualiser.
  useEffect(() => {
    snowRef.current?.setState(voice === 'live' ? 'live' : voice === 'connecting' ? 'connecting' : 'off')
  }, [voice])

  const append = (role: 'user' | 'agent', text: string) =>
    setMessages(m => [...m, { role, text }])

  // ── voice ──────────────────────────────────────────────────────────────────
  const startVoice = async () => {
    setError(null)
    setVoice('connecting')
    const client = new VoiceClient(sessionId, persona, {
      onReady: () => setVoice('live'),
      onTranscript: (role, text) => {
        if (text.trim()) append(role === 'user' ? 'user' : 'agent', text)
      },
      onLevel: (kind, level) => snowRef.current?.setLevel(kind, level),
      onTool: (name, status) => setVoiceTool(status === 'running' ? name : null),
      onError: (message, fallback, code) => {
        voiceRef.current?.stop()
        voiceRef.current = null
        setVoice('off')
        // Stale/missing session: clear it and bounce through the SES gate (same as HTTP 401).
        if (code === 'unauthorized') {
          handleUnauthorized()
          return
        }
        // Revert to 'off' so the orb collapses and the button reads "Start voice";
        // the reason stays visible in the error banner.
        setError(fallback ? `Voice unavailable (${message}). You can keep chatting by text.` : message)
      },
      onClose: () => { if (voiceRef.current) setVoice('off') },
    })
    voiceRef.current = client
    try {
      await client.start()
    } catch (e) {
      setVoice('off')
      setError(`Could not start voice: ${String(e)}. You can keep chatting by text.`)
      voiceRef.current = null
    }
  }

  const stopVoice = async () => {
    await voiceRef.current?.stop()
    voiceRef.current = null
    setVoice('off')
    setVoiceTool(null)
  }

  // ── text ───────────────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text) return
    setInput('')

    // If voice is live, route the typed turn into the voice session (cross-modal).
    if (voice === 'live' && voiceRef.current) {
      append('user', text)
      voiceRef.current.sendText(text)
      return
    }

    if (streaming) return
    setError(null)
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
          setError(String(ev.content ?? ev.message ?? 'stream error'))
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

  const voiceLabel =
    voice === 'live' ? '● Listening — tap to stop'
    : voice === 'connecting' ? 'Connecting…'
    : '🎙 Start voice'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ padding: '20px 32px 12px', borderBottom: '1px solid var(--b)', background: 'var(--s)',
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)', margin: 0 }}>Trianz Concierge</h1>
          <p style={{ fontSize: 12, color: 'var(--t2)', margin: '2px 0 0' }}>
            Ask about Trianz’s offerings by voice or text — acting as <strong>{persona}</strong>.
          </p>
        </div>
      </div>

      {/* Body. When voice is live it splits into two columns — the snowflake visualiser
          on the LEFT and the chat transcript on the RIGHT. On mobile the transcript is
          hidden while voice is on, so the snowflake takes the whole screen. When voice is
          off it's a single full-width transcript column. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Left column — snowflake visualiser (only while voice is on) */}
        {voice !== 'off' && (
          <div style={{
            flex: isMobile ? 1 : '0 0 42%', minWidth: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 24, borderRight: isMobile ? 'none' : '1px solid var(--b)',
          }}>
            <SnowflakeVoice ref={snowRef} size={280} />
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t2)', minHeight: 18, textAlign: 'center' }}>
              {voice === 'connecting' ? 'Connecting to Nova Sonic…'
                : voiceTool ? <>🔧 Running <strong>{voiceTool}</strong>…</>
                : 'Listening — speak naturally, or type to add a turn'}
            </div>
          </div>
        )}

        {/* Right column — chat transcript. Hidden on mobile while voice is on. */}
        {!(voice !== 'off' && isMobile) && (
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 32px' }}>
            {messages.length === 0 ? (
              <div style={{ maxWidth: 560, margin: '40px auto 0', textAlign: 'center', color: 'var(--t2)' }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🛎️</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>
                  Welcome — how can Trianz help?
                </div>
                <p style={{ fontSize: 13 }}>
                  Try: “What does Trianz do?”, “Tell me about Concierto”, “We want to cut our cloud spend”,
                  or “I’d like to talk to someone.” Tap <strong>Start voice</strong> to speak.
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
        )}
      </div>

      {error && (
        <div style={{ padding: '8px 32px', color: 'var(--rd)', fontSize: 12, background: 'var(--rdd)' }}>{error}</div>
      )}

      <div style={{ padding: '14px 32px', borderTop: '1px solid var(--b)', background: 'var(--s)', flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder={voice === 'live'
              ? 'Speak, or type to inject a turn… (Enter to send)'
              : 'Ask about Trianz offerings, or say you’d like to talk to someone… (Enter to send)'}
            style={{
              flex: 1, resize: 'none', padding: '10px 14px', fontFamily: 'inherit', fontSize: 14,
              border: '1px solid var(--b2)', borderRadius: 10, color: 'var(--t)', background: 'var(--s)',
              maxHeight: 140,
            }}
          />
          <button className="btn btn-p" onClick={send} disabled={(streaming && voice !== 'live') || !input.trim()}>
            {streaming && voice !== 'live' ? 'Sending…' : 'Send'}
          </button>
          <button
            className={voice === 'live' ? 'btn btn-p' : 'btn'}
            onClick={voice === 'live' || voice === 'connecting' ? stopVoice : startVoice}
            disabled={voice === 'connecting'}
            style={voice === 'live' ? { background: 'var(--rd, #dc2626)', borderColor: 'transparent', color: '#fff', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}
          >
            {voiceLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
