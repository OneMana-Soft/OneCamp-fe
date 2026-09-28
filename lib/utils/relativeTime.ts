/**
 * A compact "how long ago" for dense admin rows: "just now", "5m ago",
 * "3h ago", "2d ago", then a short date. Empty for an unreadable time, so a
 * row shows nothing rather than "NaN".
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
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}
