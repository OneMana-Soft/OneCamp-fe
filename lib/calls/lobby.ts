// The lobby on the side of whoever runs a call (CALLS-2, design/calls-vs-zoom
// /PROGRAM.md §14): who is waiting to join, what the bar above the dock says
// of them, and how long each has waited. The server keeps the list and checks
// every decision (business/CallLobby); this only words it. Pure, with no
// React or LiveKit import, so a test, the People panel and the notice read it
// alike.

/** Someone waiting in a call's lobby, as the server lists them. */
export interface Knock {
  ticket: string
  name: string
  knocked_at: string
}

/**
 * What is said of who waits: one person by name, several by count. Null for
 * nobody. The knock bar's words, and the call's to a screen reader
 * (useCallAnnouncements). Pure.
 */
export function knockNotice<K extends Pick<Knock, "name">>(waiting: readonly K[]): { title: string; one?: K } | null {
  if (waiting.length === 0) return null
  if (waiting.length === 1) return { title: `${waiting[0].name} is waiting to join`, one: waiting[0] }
  return { title: `${waiting.length} people are waiting to join` }
}

/** How long someone has waited, in words: "Just now", "1 min", "12 min", "1 hr". Pure. */
export function waitedFor(knockedAt: string, now: number): string {
  const at = Date.parse(knockedAt)
  if (Number.isNaN(at)) return ""
  const mins = Math.floor(Math.max(0, now - at) / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} hr`
}
