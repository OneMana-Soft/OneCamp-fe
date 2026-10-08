/**
 * Automatic check-ins (business/CheckIn on the server): a question a channel
 * asks its people on chosen days at a time, answered in its thread. Pure
 * helpers, for their test.
 */

export interface CheckIn {
  id: string
  question: string
  /** 1 is Monday, 7 Sunday. */
  days: number[]
  /** "17:00", in tz. */
  time: string
  tz: string
  paused: boolean
  next_run_at?: string
  last_asked_at?: string
  last_post_uuid?: string
}

export interface CheckInInput {
  question: string
  days: number[]
  time: string
  tz: string
}

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_PLURALS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]

/** Questions teams ask, to start from. */
export const SUGGESTED_QUESTIONS: { question: string; days: number[]; time: string }[] = [
  { question: "What did you work on today?", days: [1, 2, 3, 4, 5], time: "17:00" },
  { question: "What will you work on this week?", days: [1], time: "09:30" },
  { question: "Is anything blocking you?", days: [1, 2, 3, 4, 5], time: "10:00" },
  { question: "What did you learn this week?", days: [5], time: "16:00" },
]

/** When a check-in asks, as people say it: "Weekdays at 17:00", "Mondays at 09:30", "Mon, Wed and Fri at 17:00". Pure. */
export function describeSchedule(days: number[], time: string): string {
  const d = [...new Set(days)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b)
  let when: string
  if (d.length === 7) when = "Every day"
  else if (d.length === 5 && d.every((x, i) => x === i + 1)) when = "Weekdays"
  else if (d.length === 2 && d[0] === 6 && d[1] === 7) when = "Weekends"
  else if (d.length === 1) when = DAY_PLURALS[d[0] - 1]
  else {
    const names = d.map((x) => DAY_LABELS[x - 1])
    when = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  }
  return `${when} at ${time}`
}

/** The next time a check-in asks, in the reader's own calendar: "Thu 8 Oct, 17:00". Pure. */
export function nextLabel(iso: string | undefined, locale?: string): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const day = d.toLocaleDateString(locale ?? "en-GB", { weekday: "short", day: "numeric", month: "short" })
  const time = d.toLocaleTimeString(locale ?? "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${day}, ${time}`
}
