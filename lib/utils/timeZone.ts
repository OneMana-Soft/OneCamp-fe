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
