// Time off: events marked Away. The calendar makes them whole days; the
// workload takes their working days (Monday to Friday) out of a person's
// capacity, week by week, in the reader's own days.

import { addDays, startOfDay } from "date-fns"

/** The whole days a span touches: midnight of its first day to midnight after its last. */
export function wholeDays(start: Date, end: Date): { start: Date; end: Date } {
  const from = startOfDay(start)
  // An end at midnight is the end of the day before.
  const last = startOfDay(end.getTime() === startOfDay(end).getTime() && end > from ? addDays(end, -1) : end)
  return { start: from, end: addDays(last < from ? from : last, 1) }
}

/** A span of time off; the end is exclusive. */
export interface AwaySpan {
  start: Date
  end: Date
}

/** A day counts as away when time off covers at least this much of it. */
const AWAY_DAY_MS = 12 * 3600e3

/**
 * How many working days (Monday to Friday) of the week starting at weekStart
 * the spans cover, in the reader's own days. A day counts when time off covers
 * most of it: a day off marked in another time zone straddles two of the
 * reader's days, and should count once, not twice.
 */
export function awayWorkingDays(spans: readonly AwaySpan[], weekStart: Date): number {
  let days = 0
  for (let i = 0; i < 5; i++) {
    const dayStart = addDays(startOfDay(weekStart), i)
    const dayEnd = addDays(dayStart, 1)
    let covered = 0
    for (const s of spans) {
      const from = Math.max(s.start.getTime(), dayStart.getTime())
      const to = Math.min(s.end.getTime(), dayEnd.getTime())
      if (to > from) covered += to - from
    }
    if (covered >= AWAY_DAY_MS) days++
  }
  return days
}

/** What a person takes on in a week they're away for some days: their capacity, less those days' share. */
export function capacityAfterTimeOff(capacity: number, awayDays: number): number {
  return Math.max(0, Math.round((capacity * (5 - Math.min(5, awayDays))) / 5))
}
