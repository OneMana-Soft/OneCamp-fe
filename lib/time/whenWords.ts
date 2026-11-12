/**
 * WHEN, IN WORDS (H3; linear-45 #1): a moment typed the way it is said,
 * "tomorrow 9", "in 3 days", "next Monday", "end of month", "Dec 3 14:00",
 * read into one moment and its words, for every picker that asks for a time
 * of the person's choosing (Later's Remind me, Send later, Pause, the Inbox's
 * snooze, /remind) through WhenField (components/ui/when-field).
 *
 * English only, in the browser's own zone, as every picker of the app reads a
 * moment today (DateTimeField, toLocalInputValue). Pure given now.
 *
 * - A bare day ("tomorrow", "monday", "dec 3", "next week", "next month",
 *   "next quarter") lands at Later's morning hour (MORNING_HOUR).
 * - A time alone ("9am", "14:00") is today while still ahead, else tomorrow.
 * - Weekdays, months' days, "tonight" and an hour without am or pm read as the
 *   calendar's quick create reads them, through the one reader of day and
 *   time words (lib/time/dayWords): "next monday" is next week's Monday, "this
 *   thursday" on a Thursday is today, "tomorrow 3" is 15:00, "Feb 30" no day.
 *   An hour after "this evening" or "tomorrow afternoon" is the evening's too.
 * - "in 3 days" keeps the time of day; minutes and hours land on a whole minute.
 * - "12/3" is 3 Dec to some and 12 Mar to others: refused, in words.
 * - The words are formatSendAt's, the app's one way to say a moment ahead, on
 *   the person's own clock.
 */

import { addDays, addMonths } from "date-fns"
import { formatSendAt, nextMonday } from "@/lib/messages/schedulePresets"
import { MORNING_HOUR } from "@/lib/utils/later"
import { hourOn, monthDate, monthIndex, MONTH_WORD, plainWords, readTime, TOMORROW_WORD, TONIGHT_HOUR, weekdayDate, weekdayIndex, WEEKDAY_WORD, type TimeWords } from "@/lib/time/dayWords"

/** The moments a picker takes. */
export interface WhenWindow {
  /** The earliest; any moment ahead of now when absent. */
  min?: Date
  /** The latest; a year on when absent (the server's reminder year). */
  max?: Date
  /** The caller's own rule, in its own words (sendLaterProblem, pauseUntilProblem): it judges in place of min and max. */
  problem?: (at: Date | null, now: number) => string | undefined
}

export type WhenResult = { at: Date; words: string } | { problem: string } | null

/** Where "end of day", "end of week" and "end of month" land: the working day's end, as Send later's "Later today". */
const END_HOUR = 17
const HINT = "Try words like tomorrow 9, in 2 hours or Dec 3 14:00."
const NO_DAY = "That day isn't in its month."

/** A year on from now: the latest a window takes unless it says otherwise. */
export const yearOn = (now: Date) => new Date(now.getTime() + 365 * 86_400_000)

/** Why a moment can't be used in the window, in words, or undefined when it can. Pure. */
export function whenProblem(at: Date | null, now: Date, w: WhenWindow = {}): string | undefined {
  if (w.problem) return w.problem(at, now.getTime())
  if (!at || Number.isNaN(at.getTime())) return "Choose a date and time."
  if (at <= now) return "That time has passed."
  if (w.min && at < w.min) return "Choose a later time."
  if (at > (w.max ?? yearOn(now))) return w.max ? "Choose an earlier time." : "Choose a time within the next year."
  return undefined
}

const WEEKDAY = new RegExp(`^(?:(this|next|on) )?${WEEKDAY_WORD}$`)
const TOMORROW = new RegExp(`^${TOMORROW_WORD}$`)
const NTH = "(\\d{1,2})(?:st|nd|rd|th)?"
const DAY_MONTH = new RegExp(`^(?:on )?(?:the )?${NTH} (?:of )?${MONTH_WORD}(?: (\\d{4}))?$`)
const MONTH_DAY = new RegExp(`^(?:on )?${MONTH_WORD} ${NTH}(?: (\\d{4}))?$`)
const IN = /^in (an?|\d+) ?(minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|wks?|w|months?|mos?|years?|yrs?|y)(?: (.+))?$/
const NUMERIC_DATE = /\d{1,2} ?\/ ?\d{1,2}|\b\d{1,2}-\d{1,2}\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/

/** A day read from words: its date, the hour it lands at alone, whether an hour there reads as the evening's, and whether it takes no time. */
interface Day {
  date: Date
  hour: number
  evening?: boolean
  fixed?: boolean
}

const at = (d: Date, hour: number, minute = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute)
const day = (d: Date, hour = MORNING_HOUR, more: Partial<Day> = {}): Day => ({ date: at(d, 0), hour, ...more })
const PARTS: Record<string, [hour: number, evening?: boolean]> = { morning: [MORNING_HOUR], afternoon: [14, true], evening: [18, true], night: [TONIGHT_HOUR, true] }

/** A day in words, "no day" for one its month doesn't have, or null. */
function readDay(s: string, now: Date): Day | "no day" | null {
  if (s === "today") return day(now)
  if (s === "tonight") return day(now, TONIGHT_HOUR, { evening: true })
  const part = /^(this|tomorrow) (morning|afternoon|evening|night)$/.exec(s)
  if (part) {
    const [hour, evening] = PARTS[part[2]]
    return day(addDays(now, part[1] === "this" ? 0 : 1), hour, { evening })
  }
  if (TOMORROW.test(s)) return day(addDays(now, 1))
  if (/^(end of (the )?day|eod)$/.test(s)) return day(now, END_HOUR, { fixed: true })
  if (/^(end of (the )?week|eow)$/.test(s)) return day(addDays(now, (12 - now.getDay()) % 7), END_HOUR, { fixed: true })
  if (/^(end of (the )?month|eom)$/.test(s)) return day(new Date(now.getFullYear(), now.getMonth() + 1, 0), END_HOUR, { fixed: true })
  // Next week, as Later's: Monday, a week on from a Monday.
  if (s === "next week") return day(nextMonday(now))
  if (s === "next month") return day(new Date(now.getFullYear(), now.getMonth() + 1, 1))
  if (s === "next quarter") return day(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1))
  const wd = WEEKDAY.exec(s)
  if (wd) return day(weekdayDate(now, weekdayIndex(wd[2]), wd[1]))
  const dm = DAY_MONTH.exec(s)
  const md = dm ? null : MONTH_DAY.exec(s)
  if (!dm && !md) return null
  const [d, mon, y] = dm ? [dm[1], dm[2], dm[3]] : [md![2], md![1], md![3]]
  const date = monthDate(now, monthIndex(mon), Number(d), y ? Number(y) : undefined)
  return date ? day(date) : "no day"
}

/** A day and a time as one moment: an evening's hour without am or pm is the evening's. */
function join(d: Day, t: TimeWords): Date {
  return at(d.date, hourOn(t, d.evening), t.minute)
}

/** The moment the words name, "no day", or undefined when they name none. */
function read(s: string, now: Date): Date | "no day" | undefined {
  const rel = IN.exec(s)
  if (rel) {
    const n = rel[1].startsWith("a") ? 1 : Number(rel[1])
    const unit = rel[2][0] === "m" && !rel[2].startsWith("mo") ? "minute" : rel[2].startsWith("mo") ? "month" : rel[2][0]
    if (unit === "minute" || unit === "h") {
      if (rel[3]) return undefined
      const out = new Date(now.getTime() + n * (unit === "h" ? 3_600_000 : 60_000))
      out.setSeconds(0, 0)
      return out
    }
    const base = unit === "d" ? addDays(now, n) : unit === "w" ? addDays(now, 7 * n) : addMonths(now, unit === "y" ? 12 * n : n)
    if (!rel[3]) return at(base, base.getHours(), base.getMinutes())
    const t = readTime(rel[3])
    return t ? join(day(base), t) : undefined
  }
  const whole = readDay(s, now)
  if (whole === "no day") return whole
  if (whole) return at(whole.date, whole.hour)
  const alone = readTime(s)
  if (alone) {
    const today = join(day(now), alone)
    return today > now ? today : addDays(today, 1)
  }
  // A day and a time, either way round: "tomorrow at 9", "9am tomorrow".
  const words = s.split(" ")
  for (let i = 1; i < words.length; i++) {
    const [left, right] = [words.slice(0, i).join(" "), words.slice(i).join(" ")]
    for (const [d, t] of [[left, right], [right, left]] as const) {
      const dd = readDay(d, now)
      const tt = dd && dd !== "no day" && !dd.fixed ? readTime(t) : null
      if (tt) return join(dd as Day, tt)
      if (dd === "no day" && readTime(t)) return dd
    }
  }
  return undefined
}

/**
 * The moment typed words name and how the app says it, or why it can't be
 * used, in words; null for no words. Pure given now.
 *
 *   parseWhen("tomorrow 9", now)            { at: tomorrow 9:00, words: "tomorrow at 9:00 AM" }
 *   parseWhen("12/3", now)                  { problem: "Write the month as a word, like Dec 3." }
 *   parseWhen("in 5 months", now, { problem: sendLaterProblem })   { problem: "Pick a time within the next 120 days." }
 */
export function parseWhen(text: string, now: Date, window: WhenWindow = {}): WhenResult {
  const s = plainWords(text).replace(/[.!]+$/, "")
  if (!s) return null
  if (NUMERIC_DATE.test(s)) return { problem: "Write the month as a word, like Dec 3." }
  const when = read(s, now)
  if (!when) return { problem: HINT }
  if (when === "no day") return { problem: NO_DAY }
  const problem = whenProblem(when, now, window)
  return problem ? { problem } : { at: when, words: formatSendAt(when, now) }
}
