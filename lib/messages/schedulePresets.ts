/**
 * The send-later choices, the way Slack offers them: later today while there
 * is a working day left, tomorrow morning, and Monday morning, in the person's
 * own time zone. Pure, so the choices are tested against fixed clocks.
 */

export interface SchedulePreset {
  label: string
  at: Date
}

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function schedulePresets(now: Date): SchedulePreset[] {
  const out: SchedulePreset[] = []
  // Later today, only with a couple of working hours still ahead.
  if (now.getHours() < 15) out.push({ label: "Later today, 5:00 PM", at: at(now, 0, 17) })
  out.push({ label: "Tomorrow, 9:00 AM", at: at(now, 1, 9) })
  // Next Monday, unless that is tomorrow (already offered).
  const toMonday = (8 - now.getDay()) % 7 || 7
  if (toMonday !== 1) out.push({ label: "Monday, 9:00 AM", at: at(now, toMonday, 9) })
  return out
}

/** "Tue 9:00 AM", or "Oct 14, 9:00 AM" beyond a week: how the time is shown back. */
export function formatSendAt(d: Date, now: Date = new Date()): string {
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `today at ${time}`
  const days = (d.getTime() - now.getTime()) / 86_400_000
  const day = days < 6.5
    ? d.toLocaleDateString(undefined, { weekday: "short" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `${day} at ${time}`
}

/** The value a datetime-local input needs for a Date, in local time. */
export function toLocalInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
