/**
 * The Event Model's shapes on the web (calendar programme, PROGRAM.md §4.2
 * #38; A1 builds the model, A7 the surfaces that read it).
 *
 * The package that builds the model owns its final shape: A1 brings zoned and
 * floating times (CAL3), series with their occurrences, the kinds of event, and
 * a sequence for every write. On day 0 an event is today's, as /event/getEvents
 * sends it.
 */

import type { CalendarEventInterface } from '@/types/calendar'

/** One event on the calendar: today's, as the API sends it. */
export type CalendarEvent = CalendarEventInterface

/** A stretch of the calendar to show: start inclusive, end exclusive. */
export interface CalendarRange {
  start: Date
  end: Date
}

/** What useCalendarRange answers for a range. */
export interface CalendarRangeState {
  events: CalendarEvent[]
  /**
   * 'loading' before the first answer and 'error' when it failed: the
   * calendar says so over its grid, and never shows a failed range as free.
   */
  status: 'loading' | 'ready' | 'error'
  /** Asks again. */
  retry(): void
}
