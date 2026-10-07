/**
 * The viewer's time zone (IANA, "Asia/Kolkata"), or UTC where the runtime
 * can't say. What the server is told when it counts days, sends a reminder
 * or builds a report for this person.
 */
export function browserTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/**
 * The calendar day a moment falls on where the viewer is, as YYYY-MM-DD: what
 * a date input holds and what the server reads as "that day". Not
 * toISOString(), which gives the day in UTC: in India that is still yesterday
 * until 05:30.
 */
export function localDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
