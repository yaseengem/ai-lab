import { useState, useRef, useCallback } from 'react'
import { API } from '../config'
import { useRun } from '../context/RunContext'
import type { StepState, StepStatus, ApprovalItem, SseEvent } from '../types'

const STEP_LABELS: Record<number, string> = {
  1: 'Data Ingestion', 2: 'Risk Scoring', 3: 'Counterparty Risk',
  4: 'Intervention Decision', 5: 'LOLR Execution', 6: 'Settlement Roll', 7: 'Reporting & Audit',
}
const STEP_ICONS: Record<number, string> = {
  1: '📥', 2: '🎯', 3: '🔍', 4: '⚖️', 5: '💰', 6: '📋', 7: '📊',
}
const RISK_COLORS: Record<string, string> = {
  CRITICAL: 'var(--rd)', HIGH: 'var(--am)', MEDIUM: 'var(--ac)', LOW: 'var(--gn)',
}
const RISK_BG: Record<string, string> = {
  CRITICAL: 'var(--rdd)', HIGH: 'var(--amd)', MEDIUM: 'var(--acd)', LOW: 'var(--gnd)',
}
const STATUS_COLOR: Record<StepStatus, string> = {
  waiting: 'var(--t3)', running: 'var(--ac)', complete: 'var(--gn)', skipped: 'var(--t3)', failed: 'var(--rd)',
}
const STATUS_BG: Record<StepStatus, string> = {
  waiting: 'var(--s2)', running: 'var(--acd)', complete: 'var(--gnd)', skipped: 'var(--s2)', failed: 'var(--rdd)',
}

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11,
      fontWeight: 700, color, background: bg, letterSpacing: '0.04em',
    }}>{label}</span>
  )
}

function StepCard({ step, onApprove, onReject, pendingApprovals, eventLog }: {
  step: StepState
  onApprove: (itemId: string) => void
  onReject: (itemId: string) => void
  pendingApprovals: ApprovalItem[]
  eventLog: SseEvent[]
}) {
  const [expanded, setExpanded] = useState(false)
  const stepEvents = eventLog.filter(e => 'step' in e && e.step === step.step && e.type !== 'pipeline-step')
  const hasDetails = stepEvents.length > 0 || !!step.outputSummary
  const borderColor = STATUS_COLOR[step.status]
  const bg = STATUS_BG[step.status]

  return (
    <div style={{
      border: `1.5px solid ${step.status === 'waiting' ? 'var(--b)' : borderColor}`,
      borderRadius: 10, background: bg, overflow: 'hidden', transition: 'all 0.2s',
    }}>
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: hasDetails ? 'pointer' : 'default' }}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        <span style={{ fontSize: 20 }}>{STEP_ICONS[step.step]}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t)' }}>
              Step {step.step}: {STEP_LABELS[step.step]}
            </span>
            <Badge
              label={step.status.toUpperCase()}
              color={STATUS_COLOR[step.status]}
              bg={step.status === 'waiting' ? 'var(--s3)' : bg}
            />
            {step.status === 'running' && <span style={{ fontSize: 11, color: 'var(--ac)' }}>●</span>}
          </div>
          {step.outputSummary && (
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{step.outputSummary}</div>
          )}
        </div>
        {step.elapsed !== undefined && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{step.elapsed.toFixed(1)}s</span>
        )}
        {hasDetails && <span style={{ fontSize: 12, color: 'var(--t3)' }}>{expanded ? '▲' : '▼'}</span>}
      </div>

      {pendingApprovals.map(item => (
        <div key={item.item_id} style={{
          margin: '0 16px 12px', padding: 14, background: 'var(--amd)',
          border: '1.5px solid var(--am)', borderRadius: 8,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--am)', marginBottom: 6 }}>
            ⚠️ Human Approval Required — LOLR Transaction
          </div>
          <div style={{ fontSize: 12, color: 'var(--t)', marginBottom: 4 }}>
            <b>Trade:</b> {item.trade_id} | <b>Counterparty:</b> {item.counterparty_id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t)', marginBottom: 4 }}>
            <b>ISIN:</b> {item.isin} | <b>Est. Cost:</b> {fmt(item.value_zar)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 10 }}>{item.rationale}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-p btn-sm" onClick={() => onApprove(item.item_id)}>Approve LOLR</button>
            <button
              className="btn btn-sm"
              onClick={() => onReject(item.item_id)}
              style={{ color: 'var(--rd)', borderColor: 'var(--rd)' }}
            >Reject → Escalate</button>
          </div>
        </div>
      ))}

      {expanded && stepEvents.length > 0 && (
        <div style={{ borderTop: '1px solid var(--b)', padding: '10px 16px 12px' }}>
          {stepEvents.map((ev, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              {ev.type === 'tool-call' && (
                <div style={{ fontSize: 12, color: 'var(--ac)' }}>🔧 Calling <b>{String(ev.tool)}</b>…</div>
              )}
              {ev.type === 'tool-result' && (
                <div style={{ fontSize: 12, color: 'var(--gn)' }}>✓ <b>{String(ev.tool)}</b>: {String(ev.preview || '')}</div>
              )}
              {ev.type === 'risk-item' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <Badge
                    label={String(ev.classification)}
                    color={RISK_COLORS[String(ev.classification)] || 'var(--t)'}
                    bg={RISK_BG[String(ev.classification)] || 'var(--s2)'}
                  />
                  <span style={{ color: 'var(--t)' }}>{String(ev.trade_id)} — {String(ev.counterparty_name || ev.counterparty_id)}</span>
                  <span style={{ color: 'var(--t2)' }}>{fmt(Number(ev.net_obligation_zar) || 0)}</span>
                </div>
              )}
              {ev.type === 'counterparty-brief' && (
                <div style={{ fontSize: 12, color: 'var(--t)' }}>
                  🔍 {String(ev.counterparty_id)}: root_cause=<b>{String(ev.root_cause)}</b>, urgency=<b>{String(ev.urgency)}</b>
                </div>
              )}
              {ev.type === 'intervention-item' && (
                <div style={{ fontSize: 12, color: 'var(--t)' }}>
                  ⚖️ {String(ev.trade_id)}: <b>{String(ev.intervention_type)}</b>
                  {ev.requires_human_approval ? ' 🔒 needs approval' : ''}
                </div>
              )}
              {ev.type === 'systemic-risk-alert' && (
                <div style={{ fontSize: 12, color: 'var(--rd)', fontWeight: 600 }}>🚨 {String(ev.message)}</div>
              )}
              {ev.type === 'lolr-guard-triggered' && (
                <div style={{ fontSize: 12, color: 'var(--am)' }}>🛑 {String(ev.message)}</div>
              )}
              {ev.type === 'approval-decision' && (
                <div style={{ fontSize: 12, color: ev.decision === 'approved' ? 'var(--gn)' : 'var(--rd)' }}>
                  {ev.decision === 'approved' ? '✅' : '❌'} {String(ev.item_id)}: {String(ev.decision)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function MonitorPage() {
  const ctx = useRun()

  // Local-only state (UI controls, not shared)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'api' | 'upload'>('api')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadId, setUploadId] = useState<string | null>(null)
  const [showRawLog, setShowRawLog] = useState(false)
  const [rawLog, setRawLog] = useState<string[]>([])
  const esRef = useRef<EventSource | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleEventLocal = useCallback((ev: SseEvent) => {
    ctx.handleEvent(ev)
    setRawLog(prev => [...prev.slice(-99), JSON.stringify(ev)])
    if (ev.type === 'error') setError(ev.message as string)
  }, [ctx])

  const reset = () => {
    ctx.reset()
    setError(null)
    setRawLog([])
    if (esRef.current) { esRef.current.close(); esRef.current = null }
  }

  const startMonitor = (sid: string) => {
    const es = new EventSource(`${API}/monitor/${sid}`)
    esRef.current = es
    es.onmessage = (e) => {
      try { handleEventLocal(JSON.parse(e.data)) } catch { /* ignore */ }
    }
    es.onerror = () => {
      setError('SSE connection lost')
      ctx.setRunning(false)
      es.close()
    }
  }

  const handleUploadFile = async () => {
    if (!uploadFile) return null
    const form = new FormData()
    form.append('file', uploadFile)
    const res = await fetch(`${API}/upload`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`)
    const data = await res.json()
    setUploadId(data.upload_id)
    return data.upload_id
  }

  const handleRun = async () => {
    reset()
    ctx.setRunning(true)
    try {
      let uid = uploadId
      if (mode === 'upload' && uploadFile && !uid) uid = await handleUploadFile()
      const body: Record<string, unknown> = { mode, use_mock: true }
      if (mode === 'upload' && uid) { body.upload_id = uid; body.use_mock = false }
      const res = await fetch(`${API}/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`Failed to start pipeline: ${res.statusText}`)
      const data = await res.json()
      ctx.setSessionId(data.session_id)
      startMonitor(data.session_id)
    } catch (e) {
      setError(String(e))
      ctx.setRunning(false)
    }
  }

  const { steps, riskItems, pendingApprovals, eventLog, running, done, doneSummary, sessionId } = ctx
  const criticals = riskItems.filter(r => r.classification === 'CRITICAL')
  const highs = riskItems.filter(r => r.classification === 'HIGH')
  const mediums = riskItems.filter(r => r.classification === 'MEDIUM')
  const lows = riskItems.filter(r => r.classification === 'LOW')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--t)', marginBottom: 4 }}>New Pipeline Run</h2>
        <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 18 }}>
          Trigger the 7-step settlement failure prevention pipeline for JSE T+1/T+2 windows.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['api', 'upload'] as const).map(m => (
            <button key={m} className={`btn btn-sm ${mode === m ? 'btn-p' : ''}`} onClick={() => setMode(m)}>
              {m === 'api' ? '⚡ API Trigger (Mock Data)' : '📁 Upload Exposure File'}
            </button>
          ))}
        </div>
        {mode === 'upload' && (
          <div style={{
            border: '2px dashed var(--b2)', borderRadius: 8, padding: 20, marginBottom: 16,
            textAlign: 'center', cursor: 'pointer', background: 'var(--s2)',
          }} onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".csv,.json" style={{ display: 'none' }}
              onChange={e => { setUploadFile(e.target.files?.[0] || null); setUploadId(null) }} />
            {uploadFile
              ? <span style={{ fontSize: 13, color: 'var(--gn)', fontWeight: 600 }}>✓ {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)</span>
              : <span style={{ fontSize: 13, color: 'var(--t2)' }}>Click or drag to upload exposure data CSV or JSON</span>
            }
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn btn-p" onClick={handleRun}
            disabled={running || (mode === 'upload' && !uploadFile)}
            style={{ fontSize: 14, padding: '10px 24px' }}>
            {running ? '⏳ Running…' : '▶ Start Pipeline'}
          </button>
          {sessionId && <span style={{ fontSize: 12, color: 'var(--t3)' }}>Session: {sessionId.slice(0, 8)}…</span>}
          {done && (
            <button className="btn btn-sm" onClick={() => { reset(); setUploadFile(null); setUploadId(null) }}>
              + New Run
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--rdd)', border: '1px solid var(--rd)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--rd)' }}>
          ⚠️ {error}
        </div>
      )}

      {done && doneSummary && (
        <div style={{ background: 'var(--gnd)', border: '1px solid var(--gn)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: 'var(--gn)', fontWeight: 600 }}>
          ✅ Pipeline complete. {JSON.stringify(doneSummary).slice(0, 200)}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Pipeline Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map(step => (
              <StepCard
                key={step.step}
                step={step}
                onApprove={ctx.approve}
                onReject={ctx.reject}
                pendingApprovals={pendingApprovals.filter(() => step.step === 5)}
                eventLog={eventLog}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>
            Risk Watchlist
            {riskItems.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 400, marginLeft: 8 }}>{riskItems.length} items</span>
            )}
          </h3>
          {riskItems.length === 0 && !running && (
            <div style={{ fontSize: 13, color: 'var(--t3)', padding: 20, textAlign: 'center' }}>Start a pipeline run to see risk classifications.</div>
          )}
          {riskItems.length === 0 && running && (
            <div style={{ fontSize: 13, color: 'var(--t2)', padding: 20, textAlign: 'center' }}>⏳ Waiting for risk scoring…</div>
          )}
          {riskItems.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { label: `${criticals.length} CRITICAL`, color: 'var(--rd)', bg: 'var(--rdd)' },
                { label: `${highs.length} HIGH`, color: 'var(--am)', bg: 'var(--amd)' },
                { label: `${mediums.length} MEDIUM`, color: 'var(--ac)', bg: 'var(--acd)' },
                { label: `${lows.length} LOW`, color: 'var(--gn)', bg: 'var(--gnd)' },
              ].map(b => <Badge key={b.label} label={b.label} color={b.color} bg={b.bg} />)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {riskItems.map((item, i) => (
              <div key={i} style={{
                background: 'var(--s)', border: `1.5px solid ${RISK_COLORS[item.classification]}`,
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Badge label={item.classification} color={RISK_COLORS[item.classification]} bg={RISK_BG[item.classification]} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t)' }}>{item.trade_id}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 2 }}>{item.counterparty_name || item.counterparty_id}</div>
                {item.net_obligation_zar > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{fmt(item.net_obligation_zar)}</div>
                )}
                {item.rule_triggers?.length > 0 && (
                  <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {item.rule_triggers.map((t, j) => (
                      <span key={j} style={{ fontSize: 10, color: 'var(--t2)', background: 'var(--s2)', padding: '1px 5px', borderRadius: 3 }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {rawLog.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <button className="btn btn-sm" onClick={() => setShowRawLog(v => !v)} style={{ marginBottom: 8 }}>
            {showRawLog ? '▲ Hide' : '▼ Show'} Raw Event Log ({rawLog.length} events)
          </button>
          {showRawLog && (
            <pre style={{
              background: 'var(--t)', color: '#e2e8f0', borderRadius: 8, padding: 16,
              fontSize: 11, lineHeight: 1.6, maxHeight: 400, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {rawLog.slice(-100).join('\n')}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
