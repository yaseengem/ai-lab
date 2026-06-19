import { useState, useEffect } from 'react'
import { formatDateTime } from '../lib/datetime'

interface RuleConfig {
  critical_obligation_m: number
  high_obligation_m: number
  medium_obligation_m: number
  high_lending_gap_pct: number
  medium_lending_gap_pct: number
  recent_failure_window_days: number
  cis_degraded_min_high: boolean
  lolr_auto_cap_m: number
  pipeline_interval_min: number
}

const DEFAULTS: RuleConfig = {
  critical_obligation_m: 100,
  high_obligation_m: 50,
  medium_obligation_m: 20,
  high_lending_gap_pct: 20,
  medium_lending_gap_pct: 5,
  recent_failure_window_days: 5,
  cis_degraded_min_high: true,
  lolr_auto_cap_m: 500,
  pipeline_interval_min: 30,
}

const STORAGE_KEY = 'demo4_rule_config'
const HISTORY_KEY = 'demo4_rule_config_history'

interface ChangeEntry {
  timestamp: number
  field: string
  oldValue: string
  newValue: string
}

export function RuleConfigPage() {
  const [config, setConfig] = useState<RuleConfig>(DEFAULTS)
  const [saved, setSaved] = useState<RuleConfig>(DEFAULTS)
  const [history, setHistory] = useState<ChangeEntry[]>([])
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) { const c = JSON.parse(stored); setConfig(c); setSaved(c) }
      const hist = localStorage.getItem(HISTORY_KEY)
      if (hist) setHistory(JSON.parse(hist))
    } catch { /* ignore */ }
  }, [])

  const handleSave = () => {
    const changes: ChangeEntry[] = []
    for (const key of Object.keys(config) as (keyof RuleConfig)[]) {
      if (config[key] !== saved[key]) {
        changes.push({
          timestamp: Date.now(),
          field: key,
          oldValue: String(saved[key]),
          newValue: String(config[key]),
        })
      }
    }
    const newHistory = [...changes, ...history].slice(0, 10)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
    setSaved({ ...config })
    setHistory(newHistory)
    setSaveMsg('Configuration saved.')
    setTimeout(() => setSaveMsg(null), 3000)
  }

  const handleReset = () => {
    setConfig(DEFAULTS)
  }

  const isDirty = JSON.stringify(config) !== JSON.stringify(saved)

  const N = ({ field, label, min, max, step = 1, unit }: {
    field: keyof RuleConfig; label: string; min: number; max: number; step?: number; unit?: string
  }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', marginBottom: 14 }}>
      <label style={{ fontSize: 13, color: 'var(--t)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min={min} max={max} step={step}
          value={config[field] as number}
          onChange={e => setConfig(prev => ({ ...prev, [field]: Number(e.target.value) }))}
          style={{
            width: 90, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--b)',
            fontSize: 13, background: 'var(--s)', color: 'var(--t)', textAlign: 'right',
          }}
        />
        {unit && <span style={{ fontSize: 12, color: 'var(--t2)' }}>{unit}</span>}
      </div>
      {config[field] !== DEFAULTS[field] && (
        <span style={{ fontSize: 11, color: 'var(--am)' }}>Modified</span>
      )}
      {config[field] === DEFAULTS[field] && <span />}
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--t)', marginBottom: 2 }}>Rule Configuration</h1>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>
          Risk thresholds and pipeline settings.{' '}
          <span style={{ color: 'var(--am)' }}>Display only — backend uses hardcoded rules until backend spec is implemented.</span>
        </p>
      </div>

      {saveMsg && (
        <div style={{
          background: 'var(--gnd)', border: '1px solid var(--gn)', borderRadius: 8,
          padding: '10px 16px', marginBottom: 20, fontSize: 13, color: 'var(--gn)', fontWeight: 600,
        }}>✓ {saveMsg}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Obligation thresholds */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 16 }}>Net Obligation Thresholds</h3>
          <N field="critical_obligation_m" label="CRITICAL tier: obligation above" min={1} max={10000} unit="ZAR M" />
          <N field="high_obligation_m" label="HIGH tier: obligation above" min={1} max={10000} unit="ZAR M" />
          <N field="medium_obligation_m" label="MEDIUM tier: obligation above" min={1} max={10000} unit="ZAR M" />
          <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
            LOW: all items below MEDIUM threshold
          </div>
        </div>

        {/* Securities lending thresholds */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 16 }}>Securities Lending Gap Thresholds</h3>
          <N field="high_lending_gap_pct" label="HIGH tier: lending gap above" min={0} max={100} unit="%" />
          <N field="medium_lending_gap_pct" label="MEDIUM tier: lending gap above" min={0} max={100} unit="%" />
        </div>

        {/* Escalation overrides */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 16 }}>Escalation Override Rules</h3>
          <N field="recent_failure_window_days" label="Recent failure window (upgrade to HIGH)" min={1} max={90} unit="days" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center', marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--t)' }}>CIS status DEGRADED → minimum HIGH</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={config.cis_degraded_min_high}
                onChange={e => setConfig(prev => ({ ...prev, cis_degraded_min_high: e.target.checked }))}
              />
              <span style={{ fontSize: 13, color: 'var(--t)' }}>{config.cis_degraded_min_high ? 'Enabled' : 'Disabled'}</span>
            </label>
            {config.cis_degraded_min_high !== DEFAULTS.cis_degraded_min_high
              ? <span style={{ fontSize: 11, color: 'var(--am)' }}>Modified</span>
              : <span />
            }
          </div>
        </div>

        {/* LOLR and pipeline */}
        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, padding: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 16 }}>Execution Limits</h3>
          <N field="lolr_auto_cap_m" label="LOLR auto-execution cap per cycle" min={100} max={10000} step={50} unit="ZAR M" />
          <N field="pipeline_interval_min" label="Pipeline schedule interval" min={5} max={120} unit="min" />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-p"
            onClick={handleSave}
            disabled={!isDirty}
            style={{ opacity: isDirty ? 1 : 0.5 }}
          >
            Save Configuration
          </button>
          <button className="btn btn-sm" onClick={handleReset}>Reset to Defaults</button>
        </div>
      </div>

      {/* Change history */}
      {history.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 14 }}>Change History</h3>
          <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--s2)' }}>
                  {['Timestamp', 'Field', 'Old Value', 'New Value'].map(h => (
                    <th key={h} style={{ padding: '7px 16px', textAlign: 'left', color: 'var(--t2)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--b)' }}>
                    <td style={{ padding: '8px 16px', color: 'var(--t3)' }}>
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td style={{ padding: '8px 16px', color: 'var(--t)', fontWeight: 600 }}>
                      {entry.field.replace(/_/g, ' ')}
                    </td>
                    <td style={{ padding: '8px 16px', color: 'var(--rd)' }}>{entry.oldValue}</td>
                    <td style={{ padding: '8px 16px', color: 'var(--gn)', fontWeight: 600 }}>{entry.newValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
