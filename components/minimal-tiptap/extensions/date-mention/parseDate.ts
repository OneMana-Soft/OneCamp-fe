import { addDays, format, getDay, isValid, startOfWeek } from "date-fns"
import { dateLabel } from "@/lib/liveEntity/dates"
import { clockTime } from "@/lib/utils/date/clock"
import { dayKey, WEEK_STARTS_ON } from "@/lib/utils/date/days"
import { MORNING_HOUR } from "@/lib/utils/later"

/**
 * The days a query after "@" names (small-details D4): "tod", "tomorrow",
 * "fri", "next monday", "next week", "12 Oct", "oct 12", "12/10",
 * "2026-10-12", "in 3 days". Day before month, and the week from the app's
 * first day, as everywhere in the app (lib/utils/date/shortDate, the
 * calendar): D9. A weekday reads as the calendar's quick create reads it
 * (lib/calendar/parseEventText): the coming one, a week out when it is
 * today, with or without "next". That parser isn't used here: it reads whole
 * sentences for events, always in the future, and a doc names past days too
 * ("the deck was due 11 Oct"), and is offered as the words are typed.
 */

export interface DateChoice {
  /** "2026-10-16" */
  date: string
  /** What it is called: "Tomorrow", "Friday", "Next Monday", "12 Oct". */
  label: string
  /** The day in full, quieter: "Fri 16 Oct". */
  detail: string
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]

/** A word typed as the start of one of these, three letters at least ("fri", "tom"). */
const startOf = (q: string, word: string) => q.length >= 3 && word.startsWith(q)

const at = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d)
  // 31/2 is no day: Date would roll it into March.
  return isValid(date) && date.getMonth() === m && date.getDate() === d ? date : null
}

const monthOf = (word: string) => (word.length >= 3 ? MONTHS.findIndex((m) => m.startsWith(word)) : -1)

const yearOf = (y: string | undefined, today: Date) => (!y ? today.getFullYear() : y.length === 2 ? 2000 + Number(y) : Number(y))

/** The coming day that is a weekday: "friday" on a Wednesday is in two days, on a Friday in seven. */
function comingWeekday(today: Date, weekday: number): Date {
  return addDays(today, (weekday - getDay(today) + 7) % 7 || 7)
}

/** The days a query names, best first, at most three; none when it names no day. */
function datesFor(query: string, today: Date): Array<{ date: Date; label?: string }> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ")
  if (!q) return []
  const out: Array<{ date: Date; label?: string }> = []
  if (startOf(q, "today")) out.push({ date: today })
  if (startOf(q, "tomorrow") || q === "tmr" || q === "tmrw") out.push({ date: addDays(today, 1) })
  if (startOf(q, "yesterday")) out.push({ date: addDays(today, -1) })

  const day = /^(?:next )?(.+)$/.exec(q)![1]
  if (q.startsWith("next ") && startOf(day, "week")) out.push({ date: addDays(startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), 7), label: "Next week" })
  WEEKDAYS.forEach((name, i) => {
    if (startOf(day, name)) out.push({ date: comingWeekday(today, i), label: cap(name) })
  })

  const inDays = /^in (\d{1,3})(?: ?(d|days?|w|weeks?))?$/.exec(q)
  if (inDays) {
    const n = Number(inDays[1]) * (inDays[2]?.startsWith("w") ? 7 : 1)
    out.push({ date: addDays(today, n), label: `In ${inDays[1]} ${inDays[2]?.startsWith("w") ? (inDays[1] === "1" ? "week" : "weeks") : inDays[1] === "1" ? "day" : "days"}` })
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q)
  const numeric = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/.exec(q)
  const dayMonth = /^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?: (\d{4}))?$/.exec(q)
  const monthDay = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,?(?: (\d{4}))?$/.exec(q)
  let named: Date | null = null
  if (iso) named = at(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  else if (numeric) named = at(yearOf(numeric[3], today), Number(numeric[2]) - 1, Number(numeric[1]))
  else if (dayMonth && monthOf(dayMonth[2]) >= 0) named = at(yearOf(dayMonth[3], today), monthOf(dayMonth[2]), Number(dayMonth[1]))
  else if (monthDay && monthOf(monthDay[1]) >= 0) named = at(yearOf(monthDay[3], today), monthOf(monthDay[1]), Number(monthDay[2]))
  if (named) out.push({ date: named })

  const seen = new Set<string>()
  return out.filter((c) => !seen.has(dayKey(c.date)) && seen.add(dayKey(c.date))).slice(0, 3)
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** A day in full, as the "@" list's quieter words: "Fri 16 Oct", with the year when it isn't this one. */
function dayInFull(date: Date, today: Date): string {
  return format(date, date.getFullYear() === today.getFullYear() ? "EEE d MMM" : "EEE d MMM yyyy")
}

/** The days a query names, as the "@" list offers them. */
export function dateChoices(query: string, today: Date = new Date()): DateChoice[] {
  const day = dayKey(today)
  return datesFor(query, today).map(({ date, label }) => ({
    date: dayKey(date),
    label: label ?? dateLabel(dayKey(date), day),
    detail: dayInFull(date, today),
  }))
}

/** When a reminder on a day comes: Later's morning hour that day, or the next whole hour on a day already past it. Null for a day gone by. */
export function reminderTime(date: string, now: Date = new Date()): Date | null {
  const [y, m, d] = date.split("-").map(Number)
  const morning = new Date(y, m - 1, d, MORNING_HOUR)
  if (morning > now) return morning
  if (dayKey(now) !== date) return null
  const hour = new Date(now)
  hour.setHours(now.getHours() + 1, 0, 0, 0)
  return dayKey(hour) === date ? hour : null
}

/** A reminder's time as a line reads it: "Thu 15 Oct, 9:00 AM". */
export function reminderWords(when: Date, today: Date = new Date()): string {
  return `${dayInFull(when, today)}, ${clockTime(when)}`
}
