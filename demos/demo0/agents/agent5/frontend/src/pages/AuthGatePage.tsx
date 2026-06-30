import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requestOtp, verifyOtp } from '../api/client'
import { setSession, consumeReauthNotice } from '../auth'

/**
 * Route '/auth' — the access gate (before persona select).
 *
 * Real AWS SES email-OTP: enter a work email → receive a 6-digit code → verify.
 * Public/free email domains and anything outside the allowlist are rejected. When SES
 * is not configured the backend returns the code as `dev_code`, shown here so the demo
 * is usable with zero AWS setup.
 */
const REASONS: Record<string, string> = {
  invalid_email: 'That doesn’t look like a valid email address.',
  public_email_blocked: 'Please use your work email — public/free email providers aren’t accepted.',
  domain_not_allowed: 'That email domain isn’t on the allowlist for this concierge.',
  wrong_code: 'That code is incorrect. Please try again.',
  expired: 'That code has expired — request a new one.',
  no_challenge: 'No active code — request one first.',
  too_many_attempts: 'Too many attempts — request a new code.',
}

export function AuthGatePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  // Set when a gated call 401'd and bounced the user here, so we can explain the jump.
  const [reauth] = useState<boolean>(() => consumeReauthNotice())

  const sendCode = async () => {
    setError(null)
    setDevCode(null)
    setBusy(true)
    try {
      const r = await requestOtp(email.trim())
      if (!r.ok) {
        setError(REASONS[r.reason ?? ''] ?? 'Could not send a code.')
        return
      }
      if (r.delivery === 'dev' && r.dev_code) setDevCode(r.dev_code)
      setStep('code')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setError(null)
    setBusy(true)
    try {
      const r = await verifyOtp(email.trim(), code.trim())
      if (!r.ok || !r.token) {
        setError(REASONS[r.reason ?? ''] ?? 'Verification failed.')
        return
      }
      setSession(r.token, r.email ?? email.trim())
      navigate('/')
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center' }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '32px', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛎️</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>Trianz Concierge</h1>
          <p style={{ fontSize: 14, color: 'var(--t2)' }}>
            Verify your work email to start a conversation about Trianz’s offerings.
          </p>
        </div>

        {reauth && step === 'email' && (
          <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--bg)',
                        border: '1px solid var(--b2)', borderLeft: '3px solid var(--rd)',
                        borderRadius: 8, fontSize: 13, color: 'var(--t2)' }}>
            Your session expired — please verify your work email again to continue.
          </div>
        )}

        <div style={{ background: 'var(--s)', border: '1px solid var(--b)', borderRadius: 12, padding: 24 }}>
          {step === 'email' ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.04em' }}>
                WORK EMAIL
              </label>
              <input
                type="email"
                value={email}
                autoFocus
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendCode() }}
                placeholder="you@company.com"
                style={inputStyle}
              />
              <button className="btn btn-p" disabled={busy || !email.trim()} onClick={sendCode}
                      style={{ width: '100%', marginTop: 14 }}>
                {busy ? 'Sending…' : 'Send verification code'}
              </button>
            </>
          ) : (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--t3)', letterSpacing: '0.04em' }}>
                ENTER THE 6-DIGIT CODE
              </label>
              <p style={{ fontSize: 12, color: 'var(--t2)', margin: '6px 0 0' }}>Sent to {email}</p>
              {devCode && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--bg)', border: '1px dashed var(--b2)',
                              borderRadius: 8, fontSize: 12, color: 'var(--t2)' }}>
                  Dev mode (SES not configured): your code is <strong style={{ letterSpacing: 2 }}>{devCode}</strong>
                </div>
              )}
              <input
                inputMode="numeric"
                value={code}
                autoFocus
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => { if (e.key === 'Enter') verify() }}
                placeholder="••••••"
                style={{ ...inputStyle, letterSpacing: 6, fontSize: 20, textAlign: 'center' }}
              />
              <button className="btn btn-p" disabled={busy || code.length < 6} onClick={verify}
                      style={{ width: '100%', marginTop: 14 }}>
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button className="btn" onClick={() => { setStep('email'); setCode(''); setError(null) }}
                      style={{ width: '100%', marginTop: 8, background: 'transparent', color: 'var(--t2)' }}>
                Use a different email
              </button>
            </>
          )}

          {error && (
            <div style={{ marginTop: 14, color: 'var(--rd)', fontSize: 13 }}>{error}</div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', marginTop: 16 }}>
          Access is limited to verified business emails.
        </p>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', marginTop: 8, padding: '11px 14px', fontFamily: 'inherit', fontSize: 14,
  border: '1px solid var(--b2)', borderRadius: 10, color: 'var(--t)', background: 'var(--bg)',
  boxSizing: 'border-box',
}
