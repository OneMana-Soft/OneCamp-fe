/**
 * How long a task has been in its status ("time in status", as Linear shows
 * it), for a board card. Shown once it is a day or more, so a fresh card stays
 * quiet; a week or more is "stale", so a stuck card stands out. Pure.
 */
export interface TimeInStatus {
  /** "3d", "5w", "4mo". */
  short: string
  days: number
  stale: boolean
}

const DAY = 86_400_000
export const STALE_DAYS = 7

/** since: when it entered the status (task_status_since), or when it was made. */
export function timeInStatus(since: string | undefined, created: string | undefined, now: number): TimeInStatus | null {
  const from = [since, created].map((s) => (s ? Date.parse(s) : NaN)).find((t) => Number.isFinite(t) && t > Date.UTC(1971, 0, 1))
  if (from === undefined) return null
  const days = Math.floor((now - from) / DAY)
  if (days < 1) return null
  const short = days < 14 ? `${days}d` : days < 60 ? `${Math.floor(days / 7)}w` : `${Math.floor(days / 30)}mo`
  return { short, days, stale: days >= STALE_DAYS }
}
