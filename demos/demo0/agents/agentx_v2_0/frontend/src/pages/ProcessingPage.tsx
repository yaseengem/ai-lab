import { useEffect, useRef, useState } from 'react'
import { startRun, openMonitor, approve, reject, type MonitorEvent } from '../api/client'
import { getPersona } from '../persona'

/**
 * '/processing' — start a run (POST /run), watch live output via SSE
 * /monitor/{sessionId} (native EventSource auto-reconnects). When a run is
 * awaiting approval and HITL is enabled, show Approve/Reject.
 */

interface LogLine {
  id: number
  ts: string
  type: string
  text: string
  color: string
}

let _lid = 0
const nextId = () => ++_lid

const TERMINAL = new Set(['done', 'error'])

function lineFor(ev: MonitorEvent): LogLine {
  const ts = (typeof ev._ts === 'string' ? ev._ts.slice(11, 19) : '') || new Date().toISOString().slice(11, 19)
  const t = ev.type
  let color = '#e6edf3'
  let text: string

  switch (t) {
    case 'pipeline-step': {
      const status = String(ev.status || '').toUpperCase()
      color = status === 'COMPLETE' ? '#3fb950' : status === 'FAILED' ? '#f85149' : '#58a6ff'
      const extra = ev.output_summary || ev.detail || ev.reason || ''
      text = `${status === 'COMPLETE' ? '✓' : status === 'FAILED' ? '✗' : '…'} ${ev.step ? `Step ${ev.step}: ` : ''}${ev.agent ?? ev.name ?? ''} — ${status}${extra ? `  ·  ${extra}` : ''}`
      break
    }
    case 'status-change':
      color = '#d29922'
      text = `▸ status → ${ev.status ?? ''}`
      break
    case 'done':
      color = '#3fb950'
      text = `✓ DONE${ev.status ? ` — ${ev.status}` : ''}${ev.run_id ? `  ·  ${ev.run_id}` : ''}`
      break
    case 'error':
      color = '#f85149'
      text = `✗ ERROR — ${ev.message ?? ev.detail ?? 'unknown'}`
      break
    case 'log':
    default:
      color = '#8b949e'
      text = `${ev.message ?? ev.text ?? JSON.stringify(ev)}`
  }
  return { id: nextId(), ts, type: t, text, color }
}

export function ProcessingPage() {
  const persona = getPersona() || 'user'

  const [scenarioId, setScenarioId] = useState('')
  const [payloadText, setPayloadText] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [awaitingApproval, setAwaitingApproval] = useState(false)
  const [hitlMsg, setHitlMsg] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  useEffect(() => () => { esRef.current?.close() }, [])

  const attachMonitor = (sid: string) => {
    esRef.current?.close()
    const es = openMonitor(sid)
    esRef.current = es
    es.onmessage = (e) => {
      let ev: MonitorEvent
      try { ev = JSON.parse(e.data) } catch { return }

      setLog(p => [...p, lineFor(ev)])

      if (ev.type === 'status-change' && typeof ev.status === 'string') {
        setStatus(ev.status)
        const awaiting = /approval|await|pending/i.test(ev.status)
        setAwaitingApproval(awaiting)
      }
      if (TERMINAL.has(ev.type)) {
        setRunning(false)
        setAwaitingApproval(false)
        if (ev.type === 'error') setError(String(ev.message ?? 'run failed'))
        es.close()
      }
    }
    // Native EventSource reconnects automatically on transient errors; we only
    // surface a closed connection if we were no longer expecting events.
    es.onerror = () => {
      if (!running) es.close()
    }
  }

  const start = async () => {
    setError(null)
    setLog([])
    setStatus('')
    setAwaitingApproval(false)
    setHitlMsg(null)
    setRunning(true)

    let payload: Record<string, unknown> | undefined
    if (payloadText.trim()) {
      try {
        payload = JSON.parse(payloadText)
      } catch {
        setError('Payload is not valid JSON.')
        setRunning(false)
        return
      }
    }

    try {
      const res = await startRun({
        persona,
        scenario_id: scenarioId.trim() || undefined,
        payload,
      })
      setSessionId(res.session_id)
      setRunId(res.run_id)
      setStatus(res.status)
      setLog([{ id: nextId(), ts: new Date().toISOString().slice(11, 19), type: 'meta', text: `[START] session ${res.session_id}`, color: '#58a6ff' }])
      attachMonitor(res.session_id)
    } catch (e) {
      setError(String(e))
      setRunning(false)
    }
  }

  const decide = async (decision: 'approve' | 'reject') => {
    if (!sessionId) return
    setHitlMsg(null)
    try {
      const res = decision === 'approve' ? await approve(sessionId) : await reject(sessionId)
      if (res.status === 'approvals-disabled') {
        setHitlMsg('Approvals are disabled for this agent.')
      } else {
        setHitlMsg(`Decision recorded: ${res.status}`)
        setAwaitingApproval(false)
      }
    } catch (e) {
      setHitlMsg(`Failed: ${e}`)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Processing</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Start an agent run and watch the pipeline stream live. Approve or reject when human approval is required.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Launch panel */}
        <div className="card">
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>New run</h2>

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>
            SCENARIO ID (optional)
          </label>
          <input
            value={scenarioId}
            onChange={e => setScenarioId(e.target.value)}
            placeholder="leave blank for a payload run"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--b2)', borderRadius: 7, marginBottom: 14 }}
          />

          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 5 }}>
            PAYLOAD (optional JSON)
          </label>
          <textarea
            value={payloadText}
            onChange={e => setPayloadText(e.target.value)}
            rows={6}
            placeholder='{"key": "value"}'
            style={{ width: '100%', padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', border: '1px solid var(--b2)', borderRadius: 7, resize: 'vertical', marginBottom: 14 }}
          />

          <button className="btn btn-p" onClick={start} disabled={running} style={{ width: '100%' }}>
            {running ? '⏳ Running…' : '▶ Start run'}
          </button>

          {sessionId && (
            <div style={{ marginTop: 14, fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>
              <div>session: {sessionId}</div>
              {runId && <div>run: {runId}</div>}
              {status && <div>status: {status}</div>}
            </div>
          )}
        </div>

        {/* Live output */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>
              Live output
              {running && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--am)', fontWeight: 400 }}>● streaming</span>}
            </h2>
            {status && <span className="tag tgr">{status}</span>}
          </div>

          {/* HITL banner */}
          {awaitingApproval && (
            <div className="card" style={{ marginBottom: 14, background: 'var(--amd)', borderColor: 'var(--am)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--am)', marginBottom: 8 }}>
                ⏸ Human approval required
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ok" onClick={() => decide('approve')}>Approve</button>
                <button className="btn btn-danger" onClick={() => decide('reject')}>Reject</button>
              </div>
            </div>
          )}
          {hitlMsg && (
            <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--t2)' }}>{hitlMsg}</div>
          )}
          {error && (
            <div style={{ marginBottom: 14, padding: 10, background: 'var(--rdd)', color: 'var(--rd)', borderRadius: 8, fontSize: 12 }}>
              {error}
            </div>
          )}

          <div
            ref={logRef}
            style={{
              background: '#0d1117', border: '1px solid #30363d', borderRadius: 10,
              padding: 16, fontFamily: 'monospace', fontSize: 11.5, color: '#e6edf3',
              minHeight: 280, maxHeight: 560, overflowY: 'auto', lineHeight: 1.7,
            }}
          >
            {log.length === 0 ? (
              <span style={{ color: '#6e7681' }}>No run yet. Start one to stream events here.</span>
            ) : (
              log.map(l => (
                <div key={l.id} style={{ color: l.color }}>
                  <span style={{ color: '#6e7681' }}>[{l.ts}]</span> {l.text}
                </div>
              ))
            )}
            {running && <div style={{ color: '#58a6ff' }} className="cursor-blink">▋</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
