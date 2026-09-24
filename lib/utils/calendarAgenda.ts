import { addDays, isAfter, isBefore, startOfDay } from "date-fns"

// The days of a range that have something on them, in order, for the phone
// agenda. A month grid on a phone is seven 55px columns of mostly nothing; a
// list of the days that matter reads at a glance. When today falls inside the
// range the list starts at today, because that is what someone opening a
// calendar on a phone wants to see first.
export function agendaDays<T>(start: Date, end: Date, itemsFor: (day: Date) => T[], today: Date = new Date()): { day: Date; items: T[] }[] {
  const t = startOfDay(today)
  let day = startOfDay(start)
  if (!isBefore(t, day) && !isAfter(t, end)) day = t
  const out: { day: Date; items: T[] }[] = []
  for (; !isAfter(day, end); day = addDays(day, 1)) {
    const items = itemsFor(day)
    if (items.length > 0) out.push({ day, items })
  }
  return out
}
