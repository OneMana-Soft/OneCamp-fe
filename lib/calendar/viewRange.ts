import { addBusinessDays, addDays, addMonths, addWeeks, addYears, endOfDay, endOfWeek, endOfYear, getISOWeek, getWeek, isWeekend, nextMonday, startOfDay, startOfWeek, startOfYear, type Day } from "date-fns"
import type { CalendarView } from "@/components/calendar/calendarApp"
import { monthGridRange, WEEK_STARTS_ON } from "@/components/calendar/calendarLayout"
import type { ViewChoices } from "@/lib/calendar/choices"
import type { CalendarSpan } from "@/lib/calendar/route"

type Choices = Partial<ViewChoices>
const weeks = (s: CalendarSpan) => s[1] === "w"
const daysOf = (s: CalendarSpan) => +s[0] * (weeks(s) ? 7 : 1)
export const spanWords = (s: CalendarSpan) => `${s[0]} ${weeks(s) ? "weeks" : "days"}`

/** The days a view shows around its date, from the first midnight to the last moment. Pure. */
export function shownRange(view: CalendarView, at: Date, { span = "4d", weekStartsOn = WEEK_STARTS_ON, weekends }: Choices) {
  if (view === "month" || view === "agenda") return monthGridRange(at, weekStartsOn)
  if (view === "year") return { start: startOfYear(at), end: endOfYear(at) }
  if (view === "week") return { start: startOfWeek(at, { weekStartsOn }), end: endOfWeek(at, { weekStartsOn }) }
  if (view === "custom" && weeks(span)) return { start: startOfWeek(at, { weekStartsOn }), end: endOfDay(addDays(startOfWeek(at, { weekStartsOn }), daysOf(span) - 1)) }
  // Days without the weekend are weekdays: from a Saturday, Monday on.
  const workdays = view === "custom" && weekends === false
  const start = workdays && isWeekend(at) ? nextMonday(startOfDay(at)) : startOfDay(at)
  const n = view === "day" ? 0 : daysOf(span) - 1
  return { start, end: endOfDay(workdays ? addBusinessDays(start, n) : addDays(start, n)) }
}

/** The days a time grid draws: the range shown, a hidden weekend left out (a day asked for is drawn). Pure. */
export function gridDays(view: CalendarView, at: Date, choices: Choices): Date[] {
  const out: Date[] = []
  const { start, end } = shownRange(view, at, choices)
  for (let d = start; d <= end; d = addDays(d, 1)) if (choices.weekends !== false || view === "day" || !isWeekend(d)) out.push(d)
  return out
}

/** A week's number: ISO's from Monday, else counted from the week of 1 January. Pure. */
export const weekNumber = (d: Date, weekStartsOn: Day) => (weekStartsOn === 1 ? getISOWeek(d) : getWeek(d, { weekStartsOn, firstWeekContainsDate: 1 }))

/**
 * What the calendar asks for: the month's grid around the date, which day,
 * week and month share, joined with what the view shows past it, so a custom
 * range across months asks once. A year asks for itself alone, one key a year. Pure.
 */
export function askedRange(view: CalendarView, at: Date, choices: Choices) {
  const shown = shownRange(view, at, choices)
  if (view === "year") return shown
  const grid = monthGridRange(at, choices.weekStartsOn)
  return { start: shown.start < grid.start ? shown.start : grid.start, end: shown.end > grid.end ? shown.end : grid.end }
}

/** Where J (1) and K (-1) go: by the view's own length. Pure. */
export function stepAnchor(view: CalendarView, at: Date, by: 1 | -1, { span = "4d", weekends }: Choices): Date {
  if (view === "custom") return (!weeks(span) && weekends === false ? addBusinessDays : addDays)(at, by * daysOf(span))
  return (view === "day" ? addDays : view === "week" ? addWeeks : view === "year" ? addYears : addMonths)(at, by)
}
