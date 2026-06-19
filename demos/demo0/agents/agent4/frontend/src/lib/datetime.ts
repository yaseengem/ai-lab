/**
 * Single source of truth for displaying timestamps in demo4 pages.
 *
 * All ISO timestamps from the backend (created_at, completed_at, event ts, etc.)
 * should pass through formatDateTime() before reaching the screen, so a future
 * locale or timezone-policy change is one edit, not 20.
 */

const DTF = new Intl.DateTimeFormat('en-ZA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function formatDateTime(iso: string | number | Date | undefined | null): string {
  if (iso == null || iso === '') return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return DTF.format(d).replace(',', '')
}

/** Compact form for narrow columns: 2026-05-09 14:30 (no seconds). */
export function formatDateTimeShort(iso: string | number | Date | undefined | null): string {
  if (iso == null || iso === '') return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Duration in seconds → "1m 23s" / "45s" / "2h 14m". */
export function formatDuration(start?: string | number | Date | null, end?: string | number | Date | null): string {
  if (!start) return '—'
  const a = start instanceof Date ? start : new Date(start)
  const b = end ? (end instanceof Date ? end : new Date(end)) : new Date()
  const ms = b.getTime() - a.getTime()
  if (Number.isNaN(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
