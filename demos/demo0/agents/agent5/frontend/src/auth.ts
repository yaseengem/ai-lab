/**
 * Verified-session token state for the SES email-OTP gate.
 *
 * Unlike the persona (a view, kept in sessionStorage), the auth token proves the
 * visitor verified a business email. It is kept in localStorage so a verified
 * visitor survives a refresh; "Sign out" (and a 401) clears it. This is a demo gate,
 * not a hardened auth system.
 */
import { AGENT_ID } from './config'

const TOKEN_KEY = `agent5:token:${AGENT_ID}`
const EMAIL_KEY = `agent5:email:${AGENT_ID}`
const REAUTH_KEY = `agent5:reauth:${AGENT_ID}`

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY)
  } catch {
    return null
  }
}

export function setSession(token: string, email: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EMAIL_KEY, email)
  } catch {
    /* ignore storage failures */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
  } catch {
    /* ignore */
  }
}

export function isVerified(): boolean {
  return !!getToken()
}

/**
 * Called when the server rejects a gated call with 401 — the stored token is stale
 * (TTL expired, or no server session for it). Clear it, flag that re-auth is needed so
 * the gate can explain why, and bounce back through the SES gate — instead of leaving
 * the UI stuck on a 401 error or jumping to login with no explanation.
 */
export function handleUnauthorized(): void {
  clearSession()
  try {
    sessionStorage.setItem(REAUTH_KEY, '1')
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
    window.location.assign('/auth')
  }
}

/** Read-and-clear the "session expired, please re-verify" flag set by handleUnauthorized. */
export function consumeReauthNotice(): boolean {
  try {
    if (sessionStorage.getItem(REAUTH_KEY)) {
      sessionStorage.removeItem(REAUTH_KEY)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}
