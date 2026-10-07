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

/** How many working days (Monday to Friday) of the week starting at weekStart the spans cover. */
export function awayWorkingDays(spans: readonly AwaySpan[], weekStart: Date): number {
  let days = 0
  for (let i = 0; i < 5; i++) {
    const dayStart = addDays(startOfDay(weekStart), i)
    const dayEnd = addDays(dayStart, 1)
    if (spans.some((s) => s.start < dayEnd && s.end > dayStart)) days++
  }
  return days
}

/** What a person takes on in a week they're away for some days: their capacity, less those days' share. */
export function capacityAfterTimeOff(capacity: number, awayDays: number): number {
  return Math.max(0, Math.round((capacity * (5 - Math.min(5, awayDays))) / 5))
}
