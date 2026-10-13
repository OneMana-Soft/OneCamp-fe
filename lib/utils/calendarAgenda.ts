import { addDays, endOfMonth, format, isAfter, isBefore, isSameDay, startOfDay, startOfMonth } from "date-fns"

// The days of a range that have something on them, in order, for the phone
// agenda. A month grid on a phone is seven 55px columns of mostly nothing; a
// list of the days that matter reads at a glance. When today falls inside the
// range the list starts at today, because that is what someone opening a
// calendar on a phone wants to see first; fromToday false lists the range
// whole (the desktop agenda, which pages by its window).
export function agendaDays<T>(start: Date, end: Date, itemsFor: (day: Date) => T[], today: Date = new Date(), fromToday = true): { day: Date; items: T[] }[] {
  const t = startOfDay(today)
  let day = startOfDay(start)
  if (fromToday && !isBefore(t, day) && !isAfter(t, end)) day = t
  const out: { day: Date; items: T[] }[] = []
  for (; !isAfter(day, end); day = addDays(day, 1)) {
    const items = itemsFor(day)
    if (items.length > 0) out.push({ day, items })
  }
  return out
}

/**
 * The desktop agenda's window (CAL-BUG-19): the days it lists, inside one
 * month. It opens on the chosen day and runs to the month's end; Next starts
 * the day after the last day listed, and Previous ends the day before the
 * first, so paging never skips a day. It used to jump a month from the chosen
 * day: on 13 October it listed to 1 November, and Next began on 13 November.
 * `to` is the last day listed, at its midnight. Pure.
 */
export interface AgendaWindow {
  from: Date
  to: Date
}

export const agendaWindowFrom = (day: Date): AgendaWindow => ({ from: startOfDay(day), to: startOfDay(endOfMonth(day)) })

export const nextAgendaWindow = (w: AgendaWindow): AgendaWindow => agendaWindowFrom(addDays(w.to, 1))

export function previousAgendaWindow(w: AgendaWindow): AgendaWindow {
  const to = addDays(startOfDay(w.from), -1)
  return { from: startOfMonth(to), to }
}

const wholeMonth = (w: AgendaWindow) => w.from.getDate() === 1 && isSameDay(w.to, endOfMonth(w.from))

/** The window's title, longest first, as the header's other titles are: "13 – 31 Oct 2026", or "November 2026" for a whole month. */
export function agendaTitles(w: AgendaWindow): string[] {
  if (wholeMonth(w)) return [format(w.from, "MMMM yyyy"), format(w.from, "MMM yyyy"), format(w.from, "MMM")]
  if (isSameDay(w.from, w.to)) return [format(w.from, "EEEE d MMMM yyyy"), format(w.from, "EEE d MMM yyyy"), format(w.from, "EEE d MMM"), format(w.from, "d MMM")]
  return [`${format(w.from, "d")} – ${format(w.to, "d MMM yyyy")}`, `${format(w.from, "d")} – ${format(w.to, "d MMM")}`, `${format(w.from, "d")}–${format(w.to, "d MMM")}`]
}

/** What an empty window says: "coming up" only when it runs from today to the month's end. */
export function agendaEmptyTitle(w: AgendaWindow, today: Date): string {
  const t = startOfDay(today)
  if (!isAfter(w.from, t) && !isBefore(w.to, t) && isSameDay(w.to, endOfMonth(w.from))) return "Nothing coming up this month"
  if (wholeMonth(w)) return `Nothing in ${format(w.from, w.from.getFullYear() === t.getFullYear() ? "MMMM" : "MMMM yyyy")}`
  if (isSameDay(w.from, w.to)) return `Nothing on ${format(w.from, "d MMMM")}`
  return `Nothing from ${format(w.from, "d")} to ${format(w.to, "d MMMM")}`
}
