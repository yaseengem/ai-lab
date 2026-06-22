/**
 * Runtime config. VITE_API_URL and VITE_AGENT_ID are injected by
 * agents/agentN/main.py before Vite starts — NEVER hardcode the URL.
 * The fallback below is only for isolated local dev when main.py didn't run.
 */
export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3098'
export const AGENT_ID = import.meta.env.VITE_AGENT_ID ?? 'agentx'
