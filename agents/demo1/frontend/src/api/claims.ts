/**
 * Calvin Claims API client.
 * VITE_API_URL is injected by agents/demo1/main.py before Vite starts.
 */

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export interface ClaimRow {
  case_id: string
  status: string
  claim_type?: string
  billed_amount?: number
  approved_amount?: number
  user_id?: string
  created_at?: string
  updated_at?: string
  confidence_score?: number
}

export async function fetchCases(filters?: { status?: string; role?: string }): Promise<ClaimRow[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.role) params.set('role', filters.role ?? 'support_exec')
  return apiFetch<ClaimRow[]>(`/cases?${params}`)
}

export async function fetchSessionStatus(sessionId: string) {
  return apiFetch<{ session_id: string; case_id: string; status: string }>(`/status/${sessionId}`)
}

export async function submitApprove(caseId: string, approverId: string, notes: string) {
  return apiFetch<void>(`/approve/${caseId}`, {
    method: 'POST',
    body: JSON.stringify({ approver_id: approverId, notes }),
  })
}

export async function submitReject(caseId: string, approverId: string, reason: string) {
  return apiFetch<void>(`/reject/${caseId}`, {
    method: 'POST',
    body: JSON.stringify({ approver_id: approverId, reason }),
  })
}

export async function uploadFile(file: File, sessionId?: string, caseId?: string): Promise<{ file_ref: string; case_id: string; session_id: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('user_id', 'anonymous')
  if (sessionId) form.append('session_id', sessionId)
  if (caseId) form.append('case_id', caseId)
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

export async function createSession(role = 'end_user', userId = 'anonymous') {
  const params = new URLSearchParams({ role, user_id: userId })
  return apiFetch<{ session_id: string }>(`/sessions?${params}`, { method: 'POST' })
}

export async function* streamChat(sessionId: string, message: string, role = 'end_user', userId = 'anonymous', fileRef?: string) {
  const res = await fetch(`${API}/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, role, user_id: userId, file_ref: fileRef }),
  })
  if (!res.ok || !res.body) throw new Error(`Chat failed: ${res.status}`)
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { yield JSON.parse(line.slice(6)) } catch { /* ignore */ }
      }
    }
  }
}
