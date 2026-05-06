import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../config'
import { useRun } from '../context/RunContext'

interface Scenario {
  id: string
  name: string
  description: string
  tags: string[]
  expected: {
    critical?: number
    high?: number
    medium?: number
    low?: number
    systemic_risk?: boolean
    interventions?: string[]
    assertions?: string[]
  }
}

interface RunResult {
  sessionId: string
  scenarioId: string
  scenarioName: string
  expected: Scenario['expected']
  started: number
  done: boolean
  donePayload?: Record<string, unknown>
  error?: string
}

const TAG_COLORS: Record<string, string> = {
  standard: 'var(--ac)',
  systemic: 'var(--rd)',
  lolr: 'var(--am)',
  cis: 'var(--co)',
  watchlist: 'var(--pu)',
  boundary: 'var(--gn)',
  regulatory: 'var(--pu)',
  escalation: 'var(--am)',
  default: 'var(--t3)',
}

function TagChip({ tag }: { tag: string }) {
  const color = Object.keys(TAG_COLORS).find(k => tag.includes(k))
  const c = TAG_COLORS[color || 'default']
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      color: c, background: `${c}20`, border: `1px solid ${c}40`,
    }}>
      {tag}
    </span>
  )
}

function ExpectedBadge({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 16, fontWeight: 700, color }}>{val}</span>
      <span style={{ fontSize: 10, color: 'var(--t3)' }}>{label}</span>
    </div>
  )
}

export function TestRunnerPage() {
  const navigate = useNavigate()
  const { reset, handleEvent } = useRun()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [activeRun, setActiveRun] = useState<RunResult | null>(null)
  const [liveLog, setLiveLog] = useState<string[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch(`${API}/test/scenarios`)
      .then(r => r.json())
      .then(d => setScenarios(d.scenarios || []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [liveLog])

  const runScenario = async (scenario: Scenario) => {
    if (esRef.current) {
      esRef.current.close()
      esRef.current = null
    }
    reset()
    setLiveLog([])
    setRunningId(scenario.id)

    try {
      const res = await fetch(`${API}/test/run/${scenario.id}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const result: RunResult = {
        sessionId: data.session_id,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        expected: data.expected || {},
        started: Date.now(),
        done: false,
      }
      setActiveRun(result)
      setLiveLog([`[START] Scenario: ${scenario.name}`, `[SESSION] ${data.session_id}`])

      const es = new EventSource(`${API}/monitor/${data.session_id}`)
      esRef.current = es

      es.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data)
          handleEvent(event)

          const ts = new Date().toISOString().slice(11, 19)
          const type = event.type || 'unknown'

          if (type === 'pipeline-step') {
            const status = event.status?.toUpperCase() || ''
            const icon = status === 'COMPLETE' ? '✓' : status === 'FAILED' ? '✗' : status === 'SKIPPED' ? '→' : '…'
            setLiveLog(p => [...p, `[${ts}] ${icon} Step ${event.step}: ${event.agent} — ${status} ${event.output_summary || event.reason || ''}`])
          } else if (type === 'risk-item') {
            setLiveLog(p => [...p, `[${ts}]   risk-item  ${event.trade_id}  ${event.classification}  ZAR ${(event.net_obligation_zar / 1_000_000).toFixed(1)}M`])
          } else if (type === 'intervention-item') {
            setLiveLog(p => [...p, `[${ts}]   intervention  ${event.trade_id}  ${event.intervention_type}`])
          } else if (type === 'systemic-risk-alert') {
            setLiveLog(p => [...p, `[${ts}] ⚠ SYSTEMIC RISK ALERT — automated execution suspended`])
          } else if (type === 'lolr-guard-triggered') {
            setLiveLog(p => [...p, `[${ts}] ⚠ LOLR GUARD TRIGGERED — ZAR 500M cap reached`])
          } else if (type === 'human-approval-required') {
            setLiveLog(p => [...p, `[${ts}]   human-approval-required  ${event.item_id}`])
          } else if (type === 'done') {
            setLiveLog(p => [...p, `[${ts}] ✓ DONE — ${event.execution_status || 'COMPLETE'}`])
            setActiveRun(r => r ? { ...r, done: true, donePayload: event } : r)
            setRunningId(null)
            es.close()
          } else if (type === 'error') {
            setLiveLog(p => [...p, `[${ts}] ✗ ERROR — ${event.message}`])
            setActiveRun(r => r ? { ...r, done: true, error: event.message } : r)
            setRunningId(null)
            es.close()
          }
        } catch { /* ignore */ }
      }

      es.onerror = () => {
        setLiveLog(p => [...p, '[SSE] Connection closed'])
        setRunningId(null)
        es.close()
      }
    } catch (e) {
      setLiveLog([`[ERROR] Failed to start scenario: ${e}`])
      setRunningId(null)
    }
  }

  const resultOk = activeRun?.done && !activeRun.error

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Test Runner</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Select a scenario to run the full agent pipeline with pre-defined test data. Results stream live below.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>

        {/* Scenarios */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Test Scenarios {!loading && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)' }}>({scenarios.length})</span>}
          </h2>

          {loading ? (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading scenarios…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scenarios.map(sc => {
                const isRunning = runningId === sc.id
                const wasRun = activeRun?.scenarioId === sc.id
                return (
                  <div key={sc.id} style={{
                    background: 'var(--s)', border: `1.5px solid ${wasRun ? 'var(--ac)' : 'var(--b)'}`,
                    borderRadius: 10, padding: 18,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>{sc.name}</div>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {sc.tags.map(t => <TagChip key={t} tag={t} />)}
                        </div>
                      </div>
                      <button
                        className="btn btn-p"
                        onClick={() => runScenario(sc)}
                        disabled={!!runningId}
                        style={{ flexShrink: 0, fontSize: 12, padding: '6px 14px' }}
                      >
                        {isRunning ? '⏳ Running…' : '▶ Run'}
                      </button>
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 12, lineHeight: 1.5 }}>{sc.description}</p>

                    {sc.expected && (
                      <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)', marginBottom: 8 }}>EXPECTED OUTPUT</div>
                        <div style={{ display: 'flex', gap: 20, marginBottom: 8 }}>
                          {sc.expected.critical !== undefined && <ExpectedBadge label="CRITICAL" val={sc.expected.critical} color="var(--rd)" />}
                          {sc.expected.high !== undefined && <ExpectedBadge label="HIGH" val={sc.expected.high} color="var(--am)" />}
                          {sc.expected.medium !== undefined && <ExpectedBadge label="MEDIUM" val={sc.expected.medium} color="var(--ac)" />}
                          {sc.expected.low !== undefined && <ExpectedBadge label="LOW" val={sc.expected.low} color="var(--gn)" />}
                          {sc.expected.systemic_risk !== undefined && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: sc.expected.systemic_risk ? 'var(--rd)' : 'var(--gn)' }}>
                                {sc.expected.systemic_risk ? 'YES' : 'NO'}
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--t3)' }}>SYSTEMIC</span>
                            </div>
                          )}
                        </div>
                        {sc.expected.assertions && sc.expected.assertions.length > 0 && (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {sc.expected.assertions.map((a, i) => (
                              <li key={i} style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 2 }}>{a}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Live output */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)' }}>
              Live Output
              {runningId && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--am)', fontWeight: 400 }}>● Running…</span>}
              {resultOk && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gn)', fontWeight: 400 }}>✓ Complete</span>}
            </h2>
            {activeRun?.done && (
              <button className="btn btn-sm" onClick={() => navigate('/watchlist')}>View Watchlist →</button>
            )}
          </div>

          {!activeRun ? (
            <div style={{
              background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10,
              padding: 48, textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>▶</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t)', marginBottom: 6 }}>No run active</div>
              <div style={{ fontSize: 13, color: 'var(--t2)' }}>Select a scenario and click Run to start the pipeline.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Run info */}
              <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{activeRun.scenarioName}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: activeRun.error ? 'var(--rdd)' : activeRun.done ? 'var(--gnd)' : 'var(--amd)',
                    color: activeRun.error ? 'var(--rd)' : activeRun.done ? 'var(--gn)' : 'var(--am)',
                  }}>
                    {activeRun.error ? 'FAILED' : activeRun.done ? 'DONE' : 'RUNNING'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', fontFamily: 'monospace' }}>
                  Session: {activeRun.sessionId}
                </div>
                {activeRun.donePayload && (
                  <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4 }}>
                    Status: {String(activeRun.donePayload.execution_status || 'COMPLETE')}
                  </div>
                )}
              </div>

              {/* Log */}
              <div
                ref={logRef}
                style={{
                  background: '#0d1117', border: '1px solid #30363d', borderRadius: 10,
                  padding: 16, fontFamily: 'monospace', fontSize: 11, color: '#e6edf3',
                  maxHeight: 500, overflowY: 'auto', lineHeight: 1.6,
                }}
              >
                {liveLog.length === 0 ? (
                  <span style={{ color: '#6e7681' }}>Waiting for events…</span>
                ) : (
                  liveLog.map((line, i) => (
                    <div key={i} style={{
                      color: line.includes('✓') ? '#3fb950'
                        : line.includes('✗') || line.includes('ERROR') ? '#f85149'
                        : line.includes('⚠') ? '#d29922'
                        : line.includes('[START]') || line.includes('[SESSION]') ? '#58a6ff'
                        : '#e6edf3',
                    }}>
                      {line}
                    </div>
                  ))
                )}
                {runningId && (
                  <div style={{ color: '#58a6ff', animation: 'none' }}>_</div>
                )}
              </div>

              {/* Quick nav */}
              {activeRun.done && (
                <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', marginBottom: 10 }}>Jump to results</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Dashboard', path: '/' },
                      { label: 'Watchlist', path: '/watchlist' },
                      { label: 'Intervention Plan', path: '/intervention-plan' },
                      { label: 'LOLR Execution', path: '/lolr-execution' },
                      { label: 'Escalations', path: '/escalations' },
                      { label: 'Counterparties', path: '/counterparties' },
                      { label: 'Audit Report', path: '/audit-report' },
                    ].map(({ label, path }) => (
                      <button key={path} className="btn btn-sm" onClick={() => navigate(path)}
                        style={{ fontSize: 11 }}>{label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
