import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API } from '../config'
import { useRun } from '../context/RunContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number
  ts: string
  type: string
  line: string
  color: string
  indent: 0 | 1 | 2
}

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

interface PastRun {
  session_id: string
  run_id: string | null
  scenario_id?: string
  scenario_name?: string
  created_at: string
  status: string
  execution_status: string | null
  critical_count: number
  interventions_executed: number
  systemic_stress: boolean
  trigger_mode: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

let _entryId = 0
const nextId = () => ++_entryId

// ── Sub-components ────────────────────────────────────────────────────────────

function TagChip({ tag }: { tag: string }) {
  const key = Object.keys(TAG_COLORS).find(k => tag.includes(k))
  const c = TAG_COLORS[key || 'default']
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

// ── SSE event → LogEntry converter ────────────────────────────────────────────

function buildLogEntries(event: Record<string, unknown>, ts: string): LogEntry[] {
  const entries: LogEntry[] = []
  const type = (event.type as string) || 'unknown'

  const push = (indent: 0 | 1 | 2, color: string, line: string) =>
    entries.push({ id: nextId(), ts, type, indent, color, line })

  if (type === 'pipeline-step') {
    const status = ((event.status as string) || '').toUpperCase()
    const icon = status === 'COMPLETE' ? '✓' : status === 'FAILED' ? '✗' : status === 'SKIPPED' ? '→' : '…'
    const color = status === 'COMPLETE' ? '#3fb950' : status === 'FAILED' ? '#f85149' : status === 'SKIPPED' ? '#6e7681' : '#58a6ff'
    const extra = (event.output_summary as string) || (event.reason as string) || ''
    push(0, color, `[${ts}] ${icon} Step ${event.step}: ${event.agent} — ${status}${extra ? `  ·  ${extra}` : ''}`)

  } else if (type === 'tool-call') {
    push(1, '#6e7681', `[${ts}]   ⚡ ${event.tool}  ←  querying`)

  } else if (type === 'tool-result') {
    push(1, '#8b949e', `[${ts}]   ↩ ${event.tool}  →  ${event.preview || 'ok'}`)

  } else if (type === 'risk-item') {
    const cls = (event.classification as string) || ''
    const classColor = cls === 'CRITICAL' ? '#f85149' : cls === 'HIGH' ? '#d29922' : cls === 'MEDIUM' ? '#58a6ff' : '#3fb950'
    const zarM = (((event.net_obligation_zar as number) || 0) / 1_000_000).toFixed(1)
    const name = (event.counterparty_name as string) || (event.counterparty_id as string) || ''
    push(1, classColor, `[${ts}]   📊 ${event.trade_id}  ${name}  →  ${cls}  ZAR ${zarM}M`)
    if (event.rationale) push(2, '#8b949e', `         ${(event.rationale as string).slice(0, 220)}`)
    if ((event.rule_triggers as string[])?.length)
      push(2, '#6e7681', `         rules: ${(event.rule_triggers as string[]).join(', ')}`)

  } else if (type === 'counterparty-brief') {
    const urgColor = event.urgency === 'CRITICAL' ? '#f85149' : event.urgency === 'HIGH' ? '#d29922' : '#79c0ff'
    push(1, urgColor, `[${ts}]   🔍 ${event.counterparty_name || event.counterparty_id}  root_cause: ${event.root_cause}  urgency: ${event.urgency}  →  ${event.recommended}`)

  } else if (type === 'intervention-item') {
    const zarM = (((event.estimated_cost_zar as number) || 0) / 1_000_000).toFixed(1)
    const approvalNote = event.requires_human_approval ? '  [APPROVAL REQD]' : ''
    const zarNote = event.estimated_cost_zar ? `  ZAR ${zarM}M` : ''
    push(1, '#d29922', `[${ts}]   ⚙ ${event.trade_id}  →  ${event.intervention_type}${approvalNote}${zarNote}`)
    if (event.rationale) push(2, '#8b949e', `         ${(event.rationale as string).slice(0, 220)}`)

  } else if (type === 'agent-observation') {
    push(1, '#79c0ff', `[${ts}]   💡 ${event.text}`)

  } else if (type === 'systemic-risk-alert') {
    push(0, '#f85149', `[${ts}] ⚠  SYSTEMIC RISK ALERT — automated execution suspended`)

  } else if (type === 'lolr-guard-triggered') {
    push(0, '#d29922', `[${ts}] ⚠  LOLR GUARD TRIGGERED — ZAR 500M cap reached`)

  } else if (type === 'human-approval-required') {
    const zarM = (((event.value_zar as number) || 0) / 1_000_000).toFixed(1)
    push(0, '#d29922', `[${ts}] ⏸  HUMAN APPROVAL REQUIRED — ${event.item_id}  ZAR ${zarM}M`)

  } else if (type === 'approval-decision') {
    const approved = event.decision === 'approved'
    push(1, approved ? '#3fb950' : '#f85149',
      `[${ts}]   ${approved ? '✓' : '✗'} Approval: ${event.item_id}  →  ${((event.decision as string) || '').toUpperCase()}`)

  } else if (type === 'approval-timeout') {
    push(1, '#d29922', `[${ts}]   ⏰ Approval timeout: ${event.item_id} — escalated`)

  } else if (type === 'done') {
    push(0, '#3fb950',
      `[${ts}] ✓ DONE — ${event.execution_status || 'COMPLETE'}${event.run_id ? `  ·  ${event.run_id}` : ''}`)

  } else if (type === 'error') {
    push(0, '#f85149', `[${ts}] ✗ ERROR — ${event.message}`)
  }

  return entries
}

// ── Log renderer (shared between live and history) ────────────────────────────

function LogPane({
  entries,
  running,
  logRef,
}: {
  entries: LogEntry[]
  running?: boolean
  logRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={logRef}
      style={{
        background: '#0d1117', border: '1px solid #30363d', borderRadius: 10,
        padding: 16, fontFamily: 'monospace', fontSize: 11, color: '#e6edf3',
        maxHeight: 520, overflowY: 'auto', lineHeight: 1.75,
      }}
    >
      {entries.length === 0 ? (
        <span style={{ color: '#6e7681' }}>Waiting for events…</span>
      ) : (
        entries.map(e => (
          <div key={e.id} style={{
            paddingLeft: e.indent * 18,
            color: e.color,
            opacity: e.indent === 2 ? 0.72 : 1,
            fontSize: e.indent === 2 ? 10 : 11,
          }}>
            {e.line}
          </div>
        ))
      )}
      {running && <div style={{ color: '#58a6ff' }}>_</div>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TestRunnerPage() {
  const navigate = useNavigate()
  const { reset, handleEvent } = useRun()

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)

  const [activeRun, setActiveRun] = useState<RunResult | null>(null)
  const [liveLog, setLiveLog] = useState<LogEntry[]>([])
  const [runningId, setRunningId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const logRef = useRef<HTMLDivElement | null>(null)

  const [expandedData, setExpandedData] = useState<string | null>(null)
  const [scenarioDataCache, setScenarioDataCache] = useState<Record<string, Record<string, unknown>>>({})
  const [loadingData, setLoadingData] = useState<string | null>(null)

  const [pastRuns, setPastRuns] = useState<PastRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [historyLog, setHistoryLog] = useState<LogEntry[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  useEffect(() => {
    fetch(`${API}/test/scenarios`)
      .then(r => r.json())
      .then(d => setScenarios(d.scenarios || []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [liveLog])

  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(r => r.json())
      .then((sessions: PastRun[]) =>
        setPastRuns(sessions.filter(s => s.trigger_mode === 'test').slice(0, 20))
      )
      .catch(() => {})
  }, [activeRun?.done])

  const runScenario = async (scenario: Scenario) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    reset()
    setLiveLog([])
    setRunningId(scenario.id)

    try {
      const res = await fetch(`${API}/test/run/${scenario.id}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      setActiveRun({
        sessionId: data.session_id,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        expected: data.expected || {},
        started: Date.now(),
        done: false,
      })
      const ts = new Date().toISOString().slice(11, 19)
      setLiveLog([
        { id: nextId(), ts, type: 'meta', line: `[START] Scenario: ${scenario.name}`, color: '#58a6ff', indent: 0 },
        { id: nextId(), ts, type: 'meta', line: `[SESSION] ${data.session_id}`, color: '#58a6ff', indent: 0 },
      ])

      const es = new EventSource(`${API}/monitor/${data.session_id}`)
      esRef.current = es

      es.onmessage = (ev) => {
        try {
          const event = JSON.parse(ev.data)
          handleEvent(event)
          const evTs = new Date().toISOString().slice(11, 19)
          const entries = buildLogEntries(event, evTs)
          if (entries.length > 0) setLiveLog(p => [...p, ...entries])

          if (event.type === 'done') {
            setActiveRun(r => r ? { ...r, done: true, donePayload: event } : r)
            setRunningId(null)
            es.close()
          } else if (event.type === 'error') {
            setActiveRun(r => r ? { ...r, done: true, error: event.message } : r)
            setRunningId(null)
            es.close()
          }
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        const ts = new Date().toISOString().slice(11, 19)
        setLiveLog(p => [...p, { id: nextId(), ts, type: 'meta', line: '[SSE] Connection closed', color: '#6e7681', indent: 0 }])
        setRunningId(null)
        es.close()
      }
    } catch (e) {
      const ts = new Date().toISOString().slice(11, 19)
      setLiveLog([{ id: nextId(), ts, type: 'error', line: `[ERROR] Failed to start: ${e}`, color: '#f85149', indent: 0 }])
      setRunningId(null)
    }
  }

  const toggleDataView = async (scenarioId: string) => {
    if (expandedData === scenarioId) { setExpandedData(null); return }
    setExpandedData(scenarioId)
    if (scenarioDataCache[scenarioId]) return
    setLoadingData(scenarioId)
    try {
      const res = await fetch(`${API}/test/scenarios/${scenarioId}/data`)
      const data = await res.json()
      setScenarioDataCache(prev => ({ ...prev, [scenarioId]: data }))
    } catch { /* ignore */ }
    setLoadingData(null)
  }

  const downloadScenarioData = async (scenarioId: string) => {
    let data = scenarioDataCache[scenarioId]
    if (!data) {
      const res = await fetch(`${API}/test/scenarios/${scenarioId}/data`)
      data = await res.json()
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${scenarioId}-test-data.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const viewRunDetails = async (sessionId: string) => {
    if (selectedRunId === sessionId) { setSelectedRunId(null); setHistoryLog([]); return }
    setSelectedRunId(sessionId)
    setLoadingEvents(true)
    setHistoryLog([])
    try {
      const res = await fetch(`${API}/pipeline/${sessionId}/events`)
      const data = await res.json()
      const entries: LogEntry[] = []
      for (const ev of (data.events || [])) {
        const ts = ((ev._ts as string) || '').slice(11, 19) || '--:--:--'
        entries.push(...buildLogEntries(ev, ts))
      }
      setHistoryLog(entries)
    } catch { setHistoryLog([]) }
    setLoadingEvents(false)
  }

  const resultOk = activeRun?.done && !activeRun.error

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Test Runner</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Select a scenario to run the full agent pipeline with pre-defined test data. Results stream live with per-step detail.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>

        {/* ── Scenarios ── */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Test Scenarios{!loading && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)', marginLeft: 6 }}>({scenarios.length})</span>}
          </h2>

          {loading ? (
            <div style={{ color: 'var(--t3)', fontSize: 13 }}>Loading scenarios…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scenarios.map(sc => {
                const isRunning = runningId === sc.id
                const wasRun = activeRun?.scenarioId === sc.id
                const isExpanded = expandedData === sc.id
                const fullData = scenarioDataCache[sc.id]

                return (
                  <div key={sc.id} style={{
                    background: 'var(--s)', border: `1.5px solid ${wasRun ? 'var(--ac)' : 'var(--b)'}`,
                    borderRadius: 10, padding: 18,
                  }}>
                    {/* Name + run button */}
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

                    {/* Expected output */}
                    {sc.expected && (
                      <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
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

                    {/* Test data controls */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-sm" onClick={() => toggleDataView(sc.id)} style={{ fontSize: 11 }}>
                        {isExpanded ? '▲ Hide Data' : '▼ View Data'}{loadingData === sc.id ? ' …' : ''}
                      </button>
                      <button className="btn btn-sm" onClick={() => downloadScenarioData(sc.id)}
                        style={{ fontSize: 11 }} title="Download full test data as JSON">
                        ↓ Download JSON
                      </button>
                    </div>

                    {/* Expandable test data view */}
                    {isExpanded && (
                      <div style={{
                        marginTop: 10, background: '#0d1117', border: '1px solid #30363d',
                        borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: 10,
                      }}>
                        {!fullData ? (
                          <span style={{ color: '#6e7681' }}>Loading…</span>
                        ) : (
                          <>
                            {/* Trades table */}
                            <div style={{ color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>
                              TRADES ({(fullData.trades as unknown[])?.length || 0})
                            </div>
                            <div style={{ overflowX: 'auto', maxHeight: 140, overflowY: 'auto', marginBottom: 12 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ color: '#6e7681', borderBottom: '1px solid #21262d' }}>
                                    {['Trade ID', 'Counterparty', 'Value', 'Window', 'Side', 'Instrument'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {((fullData.trades as Record<string, unknown>[]) || []).map((t) => (
                                    <tr key={t.trade_id as string} style={{ color: '#c9d1d9', borderBottom: '1px solid #161b22' }}>
                                      <td style={{ padding: '3px 8px' }}>{t.trade_id as string}</td>
                                      <td style={{ padding: '3px 8px' }}>{t.counterparty_id as string}</td>
                                      <td style={{ padding: '3px 8px' }}>{(((t.value_zar as number) || 0) / 1e6).toFixed(1)}M</td>
                                      <td style={{ padding: '3px 8px' }}>{t.settlement_window as string}</td>
                                      <td style={{ padding: '3px 8px' }}>{t.side as string}</td>
                                      <td style={{ padding: '3px 8px', color: '#8b949e' }}>{((t.instrument as string) || '').slice(0, 18)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Counterparty profiles */}
                            {fullData.counterparty_profiles && Object.keys(fullData.counterparty_profiles as object).length > 0 && (
                              <>
                                <div style={{ color: '#8b949e', fontWeight: 700, marginBottom: 6 }}>
                                  COUNTERPARTIES ({Object.keys(fullData.counterparty_profiles as object).length})
                                </div>
                                <div style={{ overflowX: 'auto', maxHeight: 120, overflowY: 'auto', marginBottom: 12 }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ color: '#6e7681', borderBottom: '1px solid #21262d' }}>
                                        {['ID', 'Name', 'Obligation', 'Rating', 'Lending%', 'CIS'].map(h => (
                                          <th key={h} style={{ textAlign: 'left', padding: '2px 8px', fontWeight: 600 }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.values(fullData.counterparty_profiles as Record<string, Record<string, unknown>>).map((cp) => (
                                        <tr key={cp.counterparty_id as string} style={{ color: '#c9d1d9', borderBottom: '1px solid #161b22' }}>
                                          <td style={{ padding: '3px 8px' }}>{cp.counterparty_id as string}</td>
                                          <td style={{ padding: '3px 8px', color: '#8b949e' }}>{((cp.name as string) || '').slice(0, 22)}</td>
                                          <td style={{ padding: '3px 8px' }}>{(((cp.net_obligation_zar as number) || 0) / 1e6).toFixed(1)}M</td>
                                          <td style={{ padding: '3px 8px' }}>{(cp.credit_rating as string) || '—'}</td>
                                          <td style={{ padding: '3px 8px' }}>{cp.lending_balance_pct != null ? `${cp.lending_balance_pct}%` : '—'}</td>
                                          <td style={{ padding: '3px 8px' }}>{(cp.cis_status as string) || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )}

                            {/* Market context */}
                            {fullData.market_context && (
                              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', color: '#8b949e', marginBottom: 8 }}>
                                {[
                                  ['SAVI', (fullData.market_context as Record<string, unknown>).jse_volatility_index_savi],
                                  ['ALSI 1d', `${(fullData.market_context as Record<string, unknown>).alsi_1day_move_pct}%`],
                                  ['Repo', `${(fullData.market_context as Record<string, unknown>).repo_rate_sarb_pct}%`],
                                ].map(([k, v]) => (
                                  <span key={k as string}>{k}: <span style={{ color: '#c9d1d9' }}>{v as string}</span></span>
                                ))}
                                <span>Stress: <span style={{
                                  color: (fullData.market_context as Record<string, unknown>).active_jse_market_stress_flag ? '#f85149' : '#3fb950',
                                }}>
                                  {(fullData.market_context as Record<string, unknown>).active_jse_market_stress_flag ? 'YES' : 'NO'}
                                </span></span>
                              </div>
                            )}

                            {/* JSE watchlist */}
                            {fullData.jse_watchlist && Object.values(fullData.jse_watchlist as Record<string, {active: boolean}>).some(v => v.active) && (
                              <div style={{ color: '#d29922' }}>
                                ⚠ Watchlisted: {
                                  Object.entries(fullData.jse_watchlist as Record<string, {active: boolean}>)
                                    .filter(([, v]) => v.active)
                                    .map(([id]) => id).join(', ')
                                }
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Live Output ── */}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
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
              <LogPane entries={liveLog} running={!!runningId} logRef={logRef} />

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
                      <button key={path} className="btn btn-sm" onClick={() => navigate(path)} style={{ fontSize: 11 }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Past Test Runs ── */}
      {pastRuns.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Test Run History
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)', marginLeft: 6 }}>({pastRuns.length})</span>
          </h2>

          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b)' }}>
                  {['Run ID', 'Scenario', 'Time', 'Status', 'Critical', 'Interventions', 'Systemic', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--t3)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastRuns.map((run, i) => {
                  const isSelected = selectedRunId === run.session_id
                  return (
                    <tr key={run.session_id} style={{
                      borderBottom: i < pastRuns.length - 1 ? '1px solid var(--b)' : undefined,
                      background: isSelected ? 'var(--acd)' : undefined,
                    }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', color: 'var(--t2)' }}>
                        {run.run_id ? run.run_id.replace('JSE-SFPP-', '') : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t)' }}>
                        {run.scenario_name || run.scenario_id || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t3)' }}>
                        {run.created_at ? new Date(run.created_at).toLocaleTimeString() : '—'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                          background: run.execution_status === 'SUCCESS' ? 'var(--gnd)'
                            : run.execution_status === 'PARTIAL' ? 'var(--amd)' : 'var(--rdd)',
                          color: run.execution_status === 'SUCCESS' ? 'var(--gn)'
                            : run.execution_status === 'PARTIAL' ? 'var(--am)' : 'var(--rd)',
                        }}>
                          {run.execution_status || run.status?.toUpperCase() || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: run.critical_count > 0 ? 'var(--rd)' : 'var(--t3)' }}>
                        {run.critical_count}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--t2)' }}>
                        {run.interventions_executed}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {run.systemic_stress
                          ? <span style={{ fontSize: 10, color: 'var(--rd)', fontWeight: 700 }}>⚠ YES</span>
                          : <span style={{ fontSize: 10, color: 'var(--t3)' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button className="btn btn-sm" onClick={() => viewRunDetails(run.session_id)} style={{ fontSize: 11 }}>
                          {isSelected ? 'Close' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Historic run detail */}
          {selectedRunId && (
            <div style={{ marginTop: 16, background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)' }}>Run Detail</span>
                  <span style={{ marginLeft: 10, fontSize: 11, fontFamily: 'monospace', color: 'var(--t3)' }}>
                    {selectedRunId}
                  </span>
                </div>
                <button className="btn btn-sm" onClick={() => { setSelectedRunId(null); setHistoryLog([]) }}>✕ Close</button>
              </div>
              {loadingEvents ? (
                <div style={{ color: 'var(--t3)', fontSize: 13, padding: 16 }}>Loading event log…</div>
              ) : historyLog.length === 0 ? (
                <div style={{ color: 'var(--t3)', fontSize: 13, padding: 16 }}>
                  No event log found. This run may have completed before event logging was enabled.
                </div>
              ) : (
                <LogPane entries={historyLog} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
