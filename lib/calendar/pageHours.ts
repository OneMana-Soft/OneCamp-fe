/**
 * A booking page's own week and dates (gcal-7), as the server keeps them
 * (weekHours.Hours week and dates): read, kept in step with the page's days
 * and one range, and dates gone by taken off. Only the booking editor reads
 * it, so a first screen that reads working hours never carries it. Pure.
 */
import { format } from "date-fns"
import { dayKey, type WorkingHours } from "@/lib/calendar/availability"
import { asBookingHours, dayProblem, type Dates, type Week } from "@/lib/calendar/workingHours"

/** At most this many dates of its own on a booking page, as the server keeps them. */
export const MAX_DATES = 60

/** Why a page's dates can't be kept, in the week's words; null when they can (days off always can). */
export function datesProblem(dates: Dates | undefined): string | null {
  if (!dates) return null
  if (Object.keys(dates).length > MAX_DATES) return `Up to ${MAX_DATES} dates.`
  for (const spans of Object.values(dates)) {
    const problem = dayProblem(spans)
    if (problem) return problem
  }
  return null
}

/** A page's week: its own where kept, else its days, each with its one range. */
export function pageWeek(hours: WorkingHours): Week {
  return hours.week ?? Object.fromEntries(hours.days.map((d) => [String(d), [{ start: hours.start, end: hours.end }]]))
}

/** A page's hours with this week, the days and the one range following it (what a page without a week reads). */
export function withPageWeek(hours: WorkingHours, week: Week): WorkingHours {
  return { ...hours, ...(asBookingHours(week, hours.tz) ?? { days: [] }), week }
}

/** A page's dates with those gone by in its zone taken off (today's stays), and which went. */
export function datesGoneBy(dates: Dates | undefined, tz: string, now: Date = new Date()): { dates: Dates | undefined; gone: string[] } {
  const today = dayKey(now, tz)
  const gone = Object.keys(dates ?? {}).filter((d) => d < today).sort()
  if (!dates || !gone.length) return { dates, gone: [] }
  return { dates: Object.fromEntries(Object.entries(dates).filter(([d]) => d >= today)), gone }
}

/** "We took off 3 Nov: it has gone by.", for the dates datesGoneBy took; null for none. */
export function goneBySentence(gone: string[]): string | null {
  if (!gone.length) return null
  const days = gone.map((d) => format(new Date(`${d}T12:00:00`), "d MMM"))
  const list = days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`
  return `We took off ${list}: ${days.length === 1 ? "it has" : "they have"} gone by.`
}
