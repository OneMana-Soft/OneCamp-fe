import type { CalendarView } from "@/components/calendar/calendarApp"
import { dayKey } from "@/lib/utils/date/days"
import { dayDate } from "@/lib/utils/timeZone"
import { EDIT } from "@/lib/calendar/editParam"

/**
 * Where the calendar opens: the one rule for every link to an event, a day or
 * the calendar (calendar programme, PROGRAM.md §5), which notifications,
 * chips, search and email call, and the calendar writes its own address with.
 *
 * - An event alone opens at its page, /app/calendar/event/<id>: a phone shows
 *   it there, and a computer opens the calendar with the event beside it.
 * - A day or a view is the calendar's own address (FE-F-2), so reload, Back
 *   and a link keep them: /app/calendar?date=2026-10-13&view=week, with
 *   &event=<id> while the event is open beside it.
 *
 * `others` are the address's parameters that aren't the calendar's, kept as
 * they are. Pure.
 */
export interface CalendarPlace {
  /** The day shown, written as the app keys a day (dayKey: 2026-10-13) on the device's calendar. */
  date?: Date | null
  view?: CalendarView | null
  event?: string | null
  span?: CalendarSpan | null
  /**
   * An event alone opens at its page already editing: the card's pencil, Edit
   * event, does what it says (V-34). The calendar's own address never carries
   * it: a computer edits in the panel, asked by the panel's state.
   */
  edit?: boolean
}

/** A custom view's length (Google's, on X or 4): 2 to 7 days, or 2 to 4 weeks. */
export type CalendarSpan = `${2 | 3 | 4 | 5 | 6 | 7}d` | `${2 | 3 | 4}w`
export const parseSpan = (s?: string | null) => (s && /^([2-7]d|[2-4]w)$/.test(s) ? (s as CalendarSpan) : undefined)

const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "month", "agenda", "custom", "year"]
const PARAMS = ["date", "view", "event", "span"] as const

/**
 * A day written as the address writes it (dayKey's 2026-11-05), or nothing:
 * 2026-02-31 isn't a day, though dayDate rolls it on to 3 March, so a day is
 * one that writes back as itself. Pure.
 */
export function parseDay(text: string | null | undefined): Date | undefined {
  const day = dayDate(text)
  return day && dayKey(day) === text ? day : undefined
}

export function calendarRoute(to: CalendarPlace = {}, others?: URLSearchParams): string {
  if (to.event && !to.date && !to.view && !others) return `/app/calendar/event/${to.event}${to.edit ? `?${EDIT}=1` : ""}`
  const q = new URLSearchParams(others)
  for (const p of PARAMS) q.delete(p)
  if (to.date && !Number.isNaN(to.date.getTime())) q.set("date", dayKey(to.date))
  if (to.view) q.set("view", to.view)
  if (to.span) q.set("span", to.span)
  if (to.event) q.set("event", to.event)
  const s = q.toString()
  return s ? `/app/calendar?${s}` : "/app/calendar"
}

/** What a calendar address says, each part only when it is well formed. Pure. */
export function calendarPlace(params: Pick<URLSearchParams, "get">): { date?: Date; view?: CalendarView; event?: string; span?: CalendarSpan } {
  const out: { date?: Date; view?: CalendarView; event?: string; span?: CalendarSpan } = {}
  const date = parseDay(params.get("date"))
  if (date) out.date = date
  const view = params.get("view")
  if (view && (CALENDAR_VIEWS as readonly string[]).includes(view)) out.view = view as CalendarView
  const event = params.get("event")
  // Ours are uuids; Google's are "gcal-" and its id.
  if (event && /^[\w-]{1,200}$/.test(event)) out.event = event
  const span = parseSpan(params.get("span"))
  if (span) out.span = span
  return out
}
