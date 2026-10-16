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

/**
 * A YYYY-MM-DD day as midnight of that day where the viewer is: localDay's
 * inverse, for a date picker that holds a Date. Undefined for anything else.
 * Not new Date("2026-10-14"), which is midnight in UTC: in New York that is
 * still the 13th.
 */
export function dayDate(day: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "")
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}
