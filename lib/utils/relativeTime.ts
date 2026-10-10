import { shortDate } from "@/lib/utils/date/shortDate"

/**
 * A compact "how long ago" for dense admin rows: "just now", "5m ago",
 * "3h ago", "2d ago", then a short date ("9 Oct"). Empty for an unreadable
 * time, so a row shows nothing rather than "NaN".
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ""
  const m = Math.round((now - t) / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return shortDate(new Date(iso), new Date(now))
}

/** Whole days between a time and now, never negative. */
export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000))
}

/** How long ago at the scale of days: "today", "yesterday", "3 days ago", "2 weeks ago", then a date. */
export function daysAgo(iso: string, now: number = Date.now()): string {
  const d = daysSince(iso, now)
  if (d === 0) return "today"
  if (d === 1) return "yesterday"
  if (d < 14) return `${d} days ago`
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`
  return shortDate(new Date(iso), new Date(now))
}
