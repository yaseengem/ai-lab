import { useParams, useNavigate } from 'react-router-dom'
import { useRun } from '../context/RunContext'

const RISK_COLORS: Record<string, string> = {
  CRITICAL: 'var(--rd)', HIGH: 'var(--am)', MEDIUM: 'var(--ac)', LOW: 'var(--gn)',
}
const RISK_BG: Record<string, string> = {
  CRITICAL: 'var(--rdd)', HIGH: 'var(--amd)', MEDIUM: 'var(--acd)', LOW: 'var(--gnd)',
}
const INT_COLORS: Record<string, string> = {
  LOLR_TRIGGER: 'var(--rd)', SETTLEMENT_ROLL: 'var(--am)',
  ALERT_OPERATIONS: 'var(--ac)', HUMAN_ESCALATION: 'var(--pu)', MONITOR_ONLY: 'var(--t3)',
}
const ROOT_CAUSE_COLORS: Record<string, string> = {
  LIQUIDITY: 'var(--rd)', SECURITIES_SHORTFALL: 'var(--am)',
  CIS_CONNECTIVITY: 'var(--ac)', REGULATORY_FLAG: 'var(--pu)',
  MARKET_STRESS: 'var(--co)', UNKNOWN: 'var(--t3)',
}

function fmt(n: number) { return `ZAR ${(n / 1_000_000).toFixed(1)}M` }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--b)', background: 'var(--s2)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t)' }}>{title}</span>
      </div>
      <div style={{ padding: '16px 18px' }}>{children}</div>
    </div>
  )
}

function Field({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 500, minWidth: 140 }}>{label}</span>
      <span style={{ fontSize: 12, color: color || 'var(--t)', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

export function TradeDetailPage() {
  const { tradeId } = useParams<{ tradeId: string }>()
  const navigate = useNavigate()
  const { riskItems, counterpartyBriefs, interventionItems } = useRun()

  const decoded = decodeURIComponent(tradeId || '')
  const risk = riskItems.find(r => r.trade_id === decoded)
  const brief = counterpartyBriefs.find(b => b.counterparty_id === risk?.counterparty_id)
  const intervention = interventionItems.find(i => i.trade_id === decoded)

  if (!risk) {
    return (
      <div style={{ padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t)', marginBottom: 8 }}>Trade not found</div>
        <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 20 }}>
          {decoded} is not in the current watchlist. Run a pipeline to populate data.
        </div>
        <button className="btn btn-p" onClick={() => navigate('/watchlist')}>← Back to watchlist</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <button className="btn btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t)' }}>{risk.trade_id}</h1>
            <span style={{
              fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
              color: RISK_COLORS[risk.classification], background: RISK_BG[risk.classification],
            }}>{risk.classification}</span>
            {risk.settlement_window && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                background: risk.settlement_window === 'T+1' ? 'var(--rdd)' : 'var(--amd)',
                color: risk.settlement_window === 'T+1' ? 'var(--rd)' : 'var(--am)',
              }}>{risk.settlement_window}</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 2 }}>
            {risk.counterparty_name || risk.counterparty_id}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div>
          <Card title="Trade facts">
            <Field label="Trade ID" value={risk.trade_id} />
            <Field label="ISIN" value={<span style={{ fontFamily: 'monospace', fontSize: 11 }}>{risk.isin || '—'}</span>} />
            <Field label="Instrument" value={risk.instrument || '—'} />
            <Field label="Quantity" value={risk.quantity ? risk.quantity.toLocaleString() : '—'} />
            <Field label="Value" value={risk.net_obligation_zar > 0 ? fmt(risk.net_obligation_zar) : '—'} color="var(--t)" />
            <Field label="Settlement window" value={risk.settlement_window || '—'} />
          </Card>

          <Card title="Risk classification">
            <div style={{ marginBottom: 12 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 6,
                color: RISK_COLORS[risk.classification], background: RISK_BG[risk.classification],
              }}>{risk.classification}</span>
            </div>
            {risk.rationale && (
              <div style={{ fontSize: 12, color: 'var(--t)', lineHeight: 1.6, marginBottom: 12 }}>
                {risk.rationale}
              </div>
            )}
            {risk.rule_triggers?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 6 }}>Rule triggers</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {risk.rule_triggers.map((t, i) => (
                    <span key={i} style={{
                      fontSize: 11, color: 'var(--rd)', background: 'var(--rdd)',
                      padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                    }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right column */}
        <div>
          <Card title="Counterparty profile">
            <Field label="Counterparty ID" value={risk.counterparty_id} />
            <Field label="CIS status" value={
              brief?.cis_status ? (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                  color: brief.cis_status === 'ACTIVE' ? 'var(--gn)' : brief.cis_status === 'DEGRADED' ? 'var(--am)' : 'var(--rd)',
                  background: brief.cis_status === 'ACTIVE' ? 'var(--gnd)' : brief.cis_status === 'DEGRADED' ? 'var(--amd)' : 'var(--rdd)',
                }}>{brief.cis_status}</span>
              ) : '—'
            } />
            <Field label="Net obligation" value={risk.net_obligation_zar > 0 ? fmt(risk.net_obligation_zar) : '—'} color="var(--t)" />
            <Field
              label="Lending balance"
              value={brief?.lending_balance_pct !== undefined ? `${brief.lending_balance_pct}%` : '—'}
              color={brief?.lending_balance_pct !== undefined && brief.lending_balance_pct < 80 ? 'var(--rd)' : 'var(--gn)'}
            />
            <Field label="Last failure" value={brief?.last_failure_date || 'None (90 days)'} />
            <Field label="JSE watchlist" value={
              brief?.watchlist_status ? (
                <span style={{ color: 'var(--rd)', fontWeight: 700 }}>⚠️ Active entry</span>
              ) : 'Clear'
            } />
          </Card>

          {brief && (
            <Card title="Counterparty risk brief">
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 6 }}>Root cause</div>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                  color: ROOT_CAUSE_COLORS[brief.root_cause] || 'var(--t2)',
                  background: `${ROOT_CAUSE_COLORS[brief.root_cause] || 'var(--t2)'}20`,
                }}>{brief.root_cause.replace(/_/g, ' ')}</span>
              </div>
              {brief.severity_assessment && (
                <div style={{ fontSize: 12, color: 'var(--t)', lineHeight: 1.6, marginBottom: 12 }}>
                  {brief.severity_assessment}
                </div>
              )}
              <Field label="Intervention urgency" value={brief.urgency} color={brief.urgency === 'IMMEDIATE' ? 'var(--rd)' : 'var(--am)'} />
              {brief.securities_at_risk && brief.securities_at_risk.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600, marginBottom: 6 }}>Securities at risk</div>
                  {brief.securities_at_risk.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--t)' }}>{s.isin}</span>
                      <span style={{ color: 'var(--rd)', fontWeight: 600 }}>Shortfall: {s.shortfall_qty.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {intervention && (
            <Card title="Assigned intervention">
              <div style={{ marginBottom: 10 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                  color: INT_COLORS[intervention.intervention_type] || 'var(--t2)',
                  background: `${INT_COLORS[intervention.intervention_type] || 'var(--t2)'}20`,
                }}>
                  {intervention.intervention_type.replace(/_/g, ' ')}
                </span>
                {intervention.requires_human_approval && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--am)' }}>🔒 Human approval required</span>
                )}
              </div>
              {intervention.rationale && (
                <div style={{ fontSize: 12, color: 'var(--t)', lineHeight: 1.6, marginBottom: 10 }}>
                  {intervention.rationale}
                </div>
              )}
              {intervention.estimated_cost_zar && (
                <Field label="Estimated cost" value={fmt(intervention.estimated_cost_zar)} color="var(--t)" />
              )}
              {intervention.execution_priority !== undefined && (
                <Field label="Execution priority" value={`P${intervention.execution_priority}`} />
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
