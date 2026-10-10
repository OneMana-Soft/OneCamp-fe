/**
 * What went wrong with an archive request, in words an admin can act on.
 *
 * The archive endpoints answer in `error`, not `msg`, and for a server fault
 * that is the raw dependency error (a driver message naming a table), which
 * tells a person nothing they can do. The refusals they can act on are said
 * plainly: too many requests at once, a run already going, a selection too
 * large to restore in one go. Everything else gets the caller's fallback,
 * which says what didn't happen and what to try. Pure.
 */
export function archiveProblem(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { error?: unknown; code?: unknown } } } | null | undefined
  if (!e?.response) return "Couldn't reach the server. Check your connection and try again."
  const status = e.response.status
  const data = e.response.data ?? {}
  if (status === 429) return "Too many archive requests at once. Try again in a minute."
  if (data.code === "already_running") return "This is being archived right now. Wait for that run to finish."
  if (data.code === "archive_running") return "Archiving is running right now. Try again when it finishes."
  const max = typeof data.error === "string" ? /maximum of (\d+)/.exec(data.error) : null
  if (max) return `Restore up to ${Number(max[1]).toLocaleString("en")} items at a time.`
  return fallback
}
