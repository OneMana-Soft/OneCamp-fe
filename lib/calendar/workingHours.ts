/**
 * A person's working hours as the calendar keeps them (calendar A3; the
 * Person Preference calendar.working_hours): each weekday's ranges, "0"
 * Sunday to "6" Saturday, in the person's own zone (the preference `zone`).
 * The server checks them the same way (business/Calendar WorkingHours.Week).
 * Pure.
 */

export interface Span {
  start: string
  end: string
}
export type Week = Record<string, Span[]>

/** At most this many ranges in a day, as the server keeps them. */
export const MAX_SPANS = 6

/** Monday to Friday, 09:00 to 17:00: where a week of hours starts. */
export const WORKING_WEEK: Week = Object.fromEntries([1, 2, 3, 4, 5].map((d) => [String(d), [{ start: "09:00", end: "17:00" }]]))

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** The weekdays in the order a week starting on `start` (0–6) shows them. */
export function weekOrder(start: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (start + i) % 7)
}

/** Why these hours can't be kept, in the settings' words; null when they can. */
export function weekProblem(week: Week): string | null {
  let any = false
  for (const spans of Object.values(week)) {
    if (spans.length > MAX_SPANS) return `Up to ${MAX_SPANS} ranges a day.`
    const sorted = [...spans].sort((a, b) => minutes(a.start) - minutes(b.start))
    let last = -1
    for (const s of sorted) {
      if (!s.start || !s.end) return "Pick a start and an end."
      if (minutes(s.end) <= minutes(s.start)) return "Each range has to end after it starts."
      if (minutes(s.start) < last) return "A day's ranges can't overlap."
      last = minutes(s.end)
      any = true
    }
  }
  return any ? null : "Pick at least one day."
}

/** A day turned on (with the day before's ranges, or 09:00–17:00) or off. */
export function withDay(week: Week, day: number, on: boolean): Week {
  const next = { ...week }
  if (!on) {
    delete next[String(day)]
    return next
  }
  const before = next[String((day + 6) % 7)]
  next[String(day)] = before?.length ? before.map((s) => ({ ...s })) : [{ start: "09:00", end: "17:00" }]
  return next
}

/** One range of a day changed. */
export function withSpan(week: Week, day: number, i: number, span: Span): Week {
  return { ...week, [String(day)]: (week[String(day)] ?? []).map((s, j) => (j === i ? span : s)) }
}

/** A range added after a day's last: an hour after it ends, for an hour, inside the day. */
export function withNewSpan(week: Week, day: number): Week {
  const spans = week[String(day)] ?? []
  const lastEnd = spans.length ? Math.max(...spans.map((s) => minutes(s.end))) : 8 * 60
  const start = Math.min(lastEnd + 60, 23 * 60)
  const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
  return { ...week, [String(day)]: [...spans, { start: hh(start), end: hh(Math.min(start + 60, 24 * 60 - 1)) }] }
}

/** A range of a day taken away; a day with none left is off. */
export function withoutSpan(week: Week, day: number, i: number): Week {
  const spans = (week[String(day)] ?? []).filter((_, j) => j !== i)
  const next = { ...week, [String(day)]: spans }
  if (!spans.length) delete next[String(day)]
  return next
}

/**
 * Your hours in a booking page's one-range shape (days, from, until, zone):
 * the days you work, from your earliest start to your latest end. A page
 * starts from them (calendar A3). Null when you keep no hours or zone.
 */
export function asBookingHours(week: Week | null | undefined, tz: string | null | undefined): { days: number[]; start: string; end: string; tz: string } | null {
  if (!week || !tz) return null
  const days = Object.keys(week).map(Number).filter((d) => (week[String(d)] ?? []).length).sort()
  const spans = days.flatMap((d) => week[String(d)])
  if (!spans.length) return null
  const start = spans.map((s) => s.start).sort()[0]
  const end = spans.map((s) => s.end).sort().at(-1) as string
  return { days, start, end, tz }
}

/** One day's ranges copied to every other working day (those turned on). */
export function copiedToWorkdays(week: Week, from: number): Week {
  const spans = week[String(from)] ?? []
  const next: Week = {}
  for (const [d, s] of Object.entries(week)) next[d] = s.length ? spans.map((x) => ({ ...x })) : s
  return next
}
