/**
 * Selected-persona state, kept in sessionStorage so a chosen persona survives
 * page refreshes within a tab but resets on a fresh session. The PersonaSelect
 * gate writes it; the Ribbon "Switch persona" button clears it.
 */
import { AGENT_ID } from './config'

const KEY = `agentx:persona:${AGENT_ID}`

export function getPersona(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setPersona(id: string): void {
  try {
    sessionStorage.setItem(KEY, id)
  } catch {
    /* ignore storage failures */
  }
}

export function clearPersona(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
