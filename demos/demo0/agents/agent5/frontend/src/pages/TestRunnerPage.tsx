import { useEffect, useRef, useState } from 'react'
import {
  listScenarios, runScenario, openMonitor,
  type Scenario, type MonitorEvent,
} from '../api/client'

/**
 * '/test-runner' — list GET /test/scenarios, run one (POST /test/run/{id}),
 * stream live output over /monitor/{sessionId}, and show pass/fail vs the
 * scenario's expected assertions. The verdict comes from a 'test-result' event
 * (we look for {passed:boolean, ...}); if none arrives we fall back to the
 * terminal done/error event.
 */

interface LogLine { id: number; ts: string; text: string; color: string }

let _lid = 0
const nextId = () => ++_lid

interface Verdict {
  passed: boolean | null // null = unknown / still running
  detail?: string
  assertions?: { label: string; passed: boolean }[]
}

function lineFor(ev: MonitorEvent): LogLine | null {
  const ts = (typeof ev._ts === 'string' ? ev._ts.slice(11, 19) : '') || new Date().toISOString().slice(11, 19)
  switch (ev.type) {
    case 'pipeline-step': {
      const status = String(ev.status || '').toUpperCase()
      const color = status === 'COMPLETE' ? '#3fb950' : status === 'FAILED' ? '#f85149' : '#58a6ff'
      const extra = ev.output_summary || ev.detail || ''
      return { id: nextId(), ts, color, text: `${status === 'COMPLETE' ? '✓' : status === 'FAILED' ? '✗' : '…'} ${ev.step ? `Step ${ev.step}: ` : ''}${ev.agent ?? ev.name ?? ''} — ${status}${extra ? `  ·  ${extra}` : ''}` }
    }
    case 'status-change':
      return { id: nextId(), ts, color: '#d29922', text: `▸ status → ${ev.status ?? ''}` }
    case 'test-result':
      return { id: nextId(), ts, color: ev.passed ? '#3fb950' : '#f85149', text: `${ev.passed ? '✓ PASS' : '✗ FAIL'} — ${ev.detail ?? ev.message ?? ''}` }
    case 'done':
      return { id: nextId(), ts, color: '#3fb950', text: `✓ DONE${ev.status ? ` — ${ev.status}` : ''}` }
    case 'error':
      return { id: nextId(), ts, color: '#f85149', text: `✗ ERROR — ${ev.message ?? 'failed'}` }
    case 'log':
      return { id: nextId(), ts, color: '#8b949e', text: String(ev.message ?? ev.text ?? '') }
    default:
      return null
  }
}

export function TestRunnerPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)

  const [runningId, setRunningId] = useState<string | null>(null)
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [log, setLog] = useState<LogLine[]>([])
  const [verdict, setVerdict] = useState<Verdict>({ passed: null })
  const [error, setError] = useState<string | null>(null)

  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    listScenarios()
      .then(d => setScenarios(d.scenarios || []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  useEffect(() => () => { esRef.current?.close() }, [])

  const run = async (sc: Scenario) => {
    esRef.current?.close()
    setError(null)
    setRunningId(sc.id)
    setActiveScenario(sc)
    setVerdict({ passed: null })
    setSessionId(null)
    setLog([{ id: nextId(), ts: new Date().toISOString().slice(11, 19), color: '#58a6ff', text: `[START] ${sc.name}` }])

    try {
      const res = await runScenario(sc.id)
      setSessionId(res.session_id)
      setLog(p => [...p, { id: nextId(), ts: new Date().toISOString().slice(11, 19), color: '#58a6ff', text: `[SESSION] ${res.session_id}` }])

      const es = openMonitor(res.session_id)
      esRef.current = es
      es.onmessage = (e) => {
        let ev: MonitorEvent
        try { ev = JSON.parse(e.data) } catch { return }

        const line = lineFor(ev)
        if (line) setLog(p => [...p, line])

        if (ev.type === 'test-result') {
          setVerdict({
            passed: Boolean(ev.passed),
            detail: typeof ev.detail === 'string' ? ev.detail : undefined,
            assertions: Array.isArray(ev.assertions)
              ? (ev.assertions as { label: string; passed: boolean }[])
              : undefined,
          })
        }
        if (ev.type === 'done') {
          // If no explicit test-result arrived, treat a clean done as a pass.
          setVerdict(v => (v.passed === null ? { passed: true, detail: 'completed without explicit verdict' } : v))
          setRunningId(null)
          es.close()
        } else if (ev.type === 'error') {
          setVerdict({ passed: false, detail: String(ev.message ?? 'run errored') })
          setRunningId(null)
          es.close()
        }
      }
      es.onerror = () => { if (!runningId) es.close() }
    } catch (e) {
      setError(String(e))
      setRunningId(null)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Test runner</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Run a built-in scenario through the full pipeline and compare the outcome against its expectations.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
        {/* Scenarios */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Scenarios{!loading && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)', marginLeft: 6 }}>({scenarios.length})</span>}
          </h2>

          {loading ? (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading scenarios…</div>
          ) : scenarios.length === 0 ? (
            <div className="card" style={{ color: 'var(--t3)', fontSize: 13 }}>No scenarios defined.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scenarios.map(sc => {
                const isRunning = runningId === sc.id
                const wasRun = activeScenario?.id === sc.id
                const assertions = sc.expected?.assertions ?? []
                return (
                  <div key={sc.id} style={{
                    background: 'var(--s)', border: `1.5px solid ${wasRun ? 'var(--ac)' : 'var(--b)'}`,
                    borderRadius: 10, padding: 16,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>{sc.name}</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {sc.tags.map(t => <span key={t} className="tag tgr" style={{ fontSize: 10 }}>{t}</span>)}
                        </div>
                      </div>
                      <button className="btn btn-p" onClick={() => run(sc)} disabled={!!runningId} style={{ flexShrink: 0, fontSize: 12, padding: '6px 14px' }}>
                        {isRunning ? '⏳ Running…' : '▶ Run'}
                      </button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--t2)', margin: '0 0 10px', lineHeight: 1.5 }}>{sc.description}</p>
                    {assertions.length > 0 && (
                      <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 6 }}>EXPECTED</div>
                        <ul style={{ margin: 0, paddingLeft: 16 }}>
                          {assertions.map((a, i) => (
                            <li key={i} style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 2 }}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live output + verdict */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>
              Live output
              {runningId && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--am)', fontWeight: 400 }}>● running</span>}
            </h2>
            {verdict.passed !== null && (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                background: verdict.passed ? 'var(--gnd)' : 'var(--rdd)',
                color: verdict.passed ? 'var(--gn)' : 'var(--rd)',
              }}>
                {verdict.passed ? '✓ PASS' : '✗ FAIL'}
              </span>
            )}
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: 10, background: 'var(--rdd)', color: 'var(--rd)', borderRadius: 8, fontSize: 12 }}>{error}</div>
          )}

          {!activeScenario ? (
            <div className="card" style={{ padding: 44, textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>▶</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 4 }}>No run active</div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>Pick a scenario and click Run.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{activeScenario.name}</div>
                {sessionId && <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace', marginTop: 4 }}>session: {sessionId}</div>}
                {verdict.detail && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 6 }}>{verdict.detail}</div>}
                {verdict.assertions && verdict.assertions.length > 0 && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                    {verdict.assertions.map((a, i) => (
                      <li key={i} style={{ fontSize: 12, color: a.passed ? 'var(--gn)' : 'var(--rd)', marginBottom: 2 }}>
                        {a.passed ? '✓' : '✗'} {a.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div
                ref={logRef}
                style={{
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: 10,
                  padding: 16, fontFamily: 'monospace', fontSize: 11.5, color: '#e6edf3',
                  maxHeight: 480, minHeight: 220, overflowY: 'auto', lineHeight: 1.7,
                }}
              >
                {log.length === 0 ? (
                  <span style={{ color: '#6e7681' }}>Waiting for events…</span>
                ) : (
                  log.map(l => (
                    <div key={l.id} style={{ color: l.color }}>
                      <span style={{ color: '#6e7681' }}>[{l.ts}]</span> {l.text}
                    </div>
                  ))
                )}
                {runningId && <div className="cursor-blink" style={{ color: '#58a6ff' }}>▋</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
