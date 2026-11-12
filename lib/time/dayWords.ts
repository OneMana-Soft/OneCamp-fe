/**
 * DAY AND TIME WORDS (CR-B9 M1): how the app reads a day or a time of day
 * said in words, one way for each reader of them: Remind me's, Send later's
 * and Pause's words (lib/time/whenWords) and the calendar's quick create
 * (lib/calendar/parseEventText). English only, in the browser's own zone.
 * Pure given now.
 *
 * - "friday" is the coming one, a week on when today is Friday; "this friday"
 *   is this week's, today on a Friday; "next friday" is next week's, whose
 *   days start on Monday as Later's "Next week" (nextMonday).
 * - A month's day without a year is this year's until that day has gone. One
 *   its month doesn't have ("Feb 30") is no day.
 * - An hour without am or pm is the working day's: 8 to 12 the morning's, 1
 *   to 7 the afternoon's ("3" is 15:00), "07:30" or 13 on as written. On an
 *   evening's day ("tonight", 20:00 alone) it is the evening's ("tonight at
 *   9" is 21:00). A time box reads a time typed alone as a clock
 *   (`clock`): "7:30" there is 07:30, as every time field reads it.
 */

import { addDays, startOfDay } from "date-fns"
import { nextMonday } from "@/lib/messages/schedulePresets"

/** A weekday's word, "fri" or "friday", as one regex group. */
export const WEEKDAY_WORD = "(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)"
/** A month's word, "dec" or "december", as one regex group. */
export const MONTH_WORD = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
/** Tomorrow's words, with no group. */
export const TOMORROW_WORD = "(?:tomorrow|tmrw?|tomorow)"
/** Where "tonight" alone lands: 20:00. */
export const TONIGHT_HOUR = 20

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

/** 0 for Sunday to 6 for Saturday, from a weekday's word. */
export const weekdayIndex = (word: string) => DAYS.indexOf(word.toLowerCase().slice(0, 3))
/** 0 for January to 11 for December, from a month's word. */
export const monthIndex = (word: string) => MONTHS.indexOf(word.toLowerCase().slice(0, 3))

/** Words as the readers take them: lower case, "p.m." as "pm", one space for commas and runs of space. */
export const plainWords = (text: string) =>
  text
    .toLowerCase()
    .replace(/\b([ap])\.m\.?/g, "$1m")
    .replace(/[,\s]+/g, " ")
    .trim()

/** The day a weekday names, at midnight; `which` is the word said before it ("this", "next", "on"), if any. */
export function weekdayDate(now: Date, weekday: number, which?: string): Date {
  const today = startOfDay(now)
  if (which === "next") return addDays(nextMonday(today), (weekday + 6) % 7)
  return addDays(today, (weekday - today.getDay() + 7) % 7 || (which === "this" ? 0 : 7))
}

/** A month's day, at midnight, in `year` or this year's until it has gone; null when its month hasn't that day. */
export function monthDate(now: Date, month: number, day: number, year?: number): Date | null {
  const date = new Date(year ?? (new Date(now.getFullYear(), month, day) < startOfDay(now) ? now.getFullYear() + 1 : now.getFullYear()), month, day)
  return date.getMonth() === month && date.getDate() === day ? date : null
}

/** A time of day read from words, and whether it said its half of the day (am, pm, or an hour from 12 on). */
export interface TimeWords {
  hour: number
  minute: number
  said: boolean
}

/** A time of day in plain words ("9am", "2:30 pm", "at 14:00", "14.30", "3", "noon"), or null; with `clock`, no afternoon rule. */
export function readTime(s: string, clock?: boolean): TimeWords | null {
  const t = s.replace(/^at /, "")
  if (t === "noon" || t === "midday") return { hour: 12, minute: 0, said: true }
  if (t === "midnight") return { hour: 0, minute: 0, said: true }
  const m = /^(\d{1,2})(?:[:.](\d{2}))? ?(am|pm|a|p)?$/.exec(t)
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2] ?? 0)
  if (minute > 59 || hour > (m[3] ? 12 : 23) || (m[3] && hour === 0)) return null
  if (m[3]) hour = (hour % 12) + (m[3].startsWith("p") ? 12 : 0)
  else if (!clock && hour >= 1 && hour <= 7 && m[1].length === 1) hour += 12
  return { hour, minute, said: Boolean(m[3]) || hour >= 12 }
}

/** The hour a time names on its day: on an evening's day, an hour below 12 without am or pm is the evening's. */
export const hourOn = (t: TimeWords, evening?: boolean) => (evening && !t.said && t.hour < 12 ? t.hour + 12 : t.hour)
