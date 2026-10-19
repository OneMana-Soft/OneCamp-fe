/**
 * Repeating events on the web (calendar A7): the repeat menu's presets,
 * phrased from the event's start (PROGRAM.md D-CAL-7), the rules the custom
 * sheet can make and its sentence, and instance ids.
 *
 * The server owns a rule (business/Recurrence): it checks it, works out the
 * instances in the series' own zone, and says it in words
 * (`recurrence.text`). The web writes only the RFC 5545 rules these controls
 * make, in the server's own order, so a preset is recognised when it comes
 * back; any other rule, one imported from elsewhere, is shown in the server's
 * words and kept as it is. The sentence here mirrors the server's
 * (describe.go) for the rules the sheet makes, so what the sheet says is what
 * the event will say. Pure.
 */

export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU"
export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
/** What a change to one instance is for (D-CAL-6), as the server names it. */
export type RepeatScope = "this" | "following" | "all"

/** By Date.getDay(): Sunday is 0. */
const DAY_CODES: Weekday[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
const DAY_NAMES: Record<Weekday, string> = {
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
  SU: "Sunday",
}
/** A week as people list it: Monday first, as the server writes BYDAY. */
export const WEEK: Weekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
const WORKING_WEEK: Weekday[] = ["MO", "TU", "WE", "TH", "FR"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const PLACES = ["first", "second", "third", "fourth"]

/** A weekday's name: "Tuesday". */
export function dayName(day: Weekday): string {
  return DAY_NAMES[day]
}

/** The weekday a date falls on, by the reader's clock. */
export function weekdayOf(start: Date): Weekday {
  return DAY_CODES[start.getDay()]
}

/** Which of its weekday in its month a date is: 1 to 4, or -1 for a fifth (the last). */
export function placeInMonth(start: Date): number {
  const n = Math.ceil(start.getDate() / 7)
  return n <= 4 ? n : -1
}

function placeWord(n: number): string {
  return n === -1 ? "last" : PLACES[n - 1]
}

export interface RepeatPreset {
  key: "none" | "daily" | "weekly" | "monthly" | "yearly" | "weekdays"
  label: string
  /** The RFC 5545 rule, "" for none. */
  rule: string
}

/** The repeat menu's presets for an event starting at start, phrased from it. */
export function repeatPresets(start: Date): RepeatPreset[] {
  const day = weekdayOf(start)
  const place = placeInMonth(start)
  return [
    { key: "none", label: "Doesn't repeat", rule: "" },
    { key: "daily", label: "Daily", rule: "FREQ=DAILY" },
    { key: "weekly", label: `Weekly on ${dayName(day)}`, rule: `FREQ=WEEKLY;BYDAY=${day}` },
    { key: "monthly", label: `Monthly on the ${placeWord(place)} ${dayName(day)}`, rule: `FREQ=MONTHLY;BYDAY=${place}${day}` },
    { key: "yearly", label: `Annually on ${start.getDate()} ${MONTHS[start.getMonth()]}`, rule: "FREQ=YEARLY" },
    { key: "weekdays", label: "Every weekday", rule: `FREQ=WEEKLY;BYDAY=${WORKING_WEEK.join(",")}` },
  ]
}

/** The preset a rule is, for an event starting at start; undefined for any other rule. */
export function presetOf(rule: string, start: Date): RepeatPreset | undefined {
  const r = rule.trim().replace(/^RRULE:/i, "").toUpperCase()
  return repeatPresets(start).find((p) => p.rule === r)
}

export type RepeatEnd = { kind: "never" } | { kind: "on"; date: string } | { kind: "after"; count: number }

/** What the custom sheet edits. */
export interface CustomRepeat {
  freq: Freq
  /** 1 or more. */
  interval: number
  /** For a weekly repeat: on which days (none: the start's). */
  days: Weekday[]
  /** For a monthly repeat: on the start's date ("day 16") or on its place ("the third Friday"). */
  monthly: "date" | "place"
  end: RepeatEnd
}

/** The sheet's first state for an event starting at start: weekly on its day, never ending. */
export function customFor(start: Date): CustomRepeat {
  return { freq: "WEEKLY", interval: 1, days: [weekdayOf(start)], monthly: "place", end: { kind: "never" } }
}

const MAX_INTERVAL = 1000
/** The most times a counted repeat may happen (business/Recurrence MaxCount). */
export const MAX_COUNT = 1000

/** The rule the sheet makes, in the server's order of parts. */
export function customRule(c: CustomRepeat, start: Date): string {
  const parts = [`FREQ=${c.freq}`]
  const interval = Math.min(Math.max(Math.round(c.interval) || 1, 1), MAX_INTERVAL)
  if (interval > 1) parts.push(`INTERVAL=${interval}`)
  if (c.freq === "MONTHLY") {
    parts.push(c.monthly === "date" ? `BYMONTHDAY=${start.getDate()}` : `BYDAY=${placeInMonth(start)}${weekdayOf(start)}`)
  }
  if (c.freq === "WEEKLY") {
    const days = WEEK.filter((d) => c.days.includes(d))
    parts.push(`BYDAY=${(days.length ? days : [weekdayOf(start)]).join(",")}`)
  }
  if (c.end.kind === "after") parts.push(`COUNT=${Math.min(Math.max(Math.round(c.end.count) || 1, 1), MAX_COUNT)}`)
  if (c.end.kind === "on") parts.push(`UNTIL=${c.end.date.replaceAll("-", "")}`)
  return parts.join(";")
}

/** A rule the sheet can edit, as the sheet holds it; null for any other (shown in the server's words, kept). */
export function parseCustom(rule: string, start: Date): CustomRepeat | null {
  const text = rule.trim().replace(/^RRULE:/i, "").toUpperCase()
  if (!text) return null
  const parts = new Map<string, string>()
  for (const part of text.split(";")) {
    const [k, v, ...rest] = part.split("=")
    if (!k || v === undefined || rest.length || parts.has(k)) return null
    parts.set(k, v)
  }
  const freq = parts.get("FREQ") as Freq | undefined
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null
  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "COUNT", "UNTIL"])
  for (const k of parts.keys()) if (!known.has(k)) return null
  const interval = parts.has("INTERVAL") ? Number(parts.get("INTERVAL")) : 1
  if (!Number.isInteger(interval) || interval < 1 || interval > MAX_INTERVAL) return null
  const c: CustomRepeat = { freq, interval, days: [], monthly: "place", end: { kind: "never" } }
  const byDay = parts.get("BYDAY")
  const byMonthDay = parts.get("BYMONTHDAY")
  if (freq === "WEEKLY") {
    if (byMonthDay) return null
    const days = byDay ? byDay.split(",") : [weekdayOf(start)]
    if (!days.every((d) => (WEEK as string[]).includes(d))) return null
    c.days = WEEK.filter((d) => days.includes(d))
  } else if (freq === "MONTHLY") {
    if (byDay && byMonthDay) return null
    if (byMonthDay) {
      if (byMonthDay !== String(start.getDate())) return null
      c.monthly = "date"
    } else if (byDay) {
      if (byDay !== `${placeInMonth(start)}${weekdayOf(start)}`) return null
    } else {
      c.monthly = "date"
    }
  } else if (byDay || byMonthDay) {
    return null
  }
  const count = parts.get("COUNT")
  const until = parts.get("UNTIL")
  if (count && until) return null
  if (count) {
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > MAX_COUNT) return null
    c.end = { kind: "after", count: n }
  } else if (until) {
    const m = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(until)
    if (!m) return null
    c.end = { kind: "on", date: `${m[1]}-${m[2]}-${m[3]}` }
  }
  return c
}

/** "Tuesday and Thursday", "Monday, Wednesday and Friday". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

const UNITS: Record<Freq, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }
const ONCE: Record<Freq, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Annually" }

/** "18 December 2026" for "2026-12-18". */
function longDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/**
 * What the sheet makes, in words, as the server will say it: "Every 2 weeks
 * on Tuesday and Thursday, until 18 December 2026".
 */
export function describeCustom(c: CustomRepeat, start: Date): string {
  const interval = Math.max(Math.round(c.interval) || 1, 1)
  const days = c.freq === "WEEKLY" ? WEEK.filter((d) => c.days.includes(d)) : []
  const shown = days.length ? days : [weekdayOf(start)]
  let out: string
  if (c.freq === "WEEKLY" && interval === 1 && shown.length === 5 && WORKING_WEEK.every((d) => shown.includes(d))) {
    out = "Every weekday"
  } else if (c.freq === "WEEKLY" && interval === 1 && shown.length === 7) {
    out = "Daily"
  } else {
    out = interval > 1 ? `Every ${interval} ${UNITS[c.freq]}s` : ONCE[c.freq]
    if (c.freq === "WEEKLY") out += ` on ${list(shown.map(dayName))}`
    if (c.freq === "MONTHLY") {
      out += c.monthly === "date" ? ` on day ${start.getDate()}` : ` on the ${placeWord(placeInMonth(start))} ${dayName(weekdayOf(start))}`
    }
    if (c.freq === "YEARLY") out += ` on ${start.getDate()} ${MONTHS[start.getMonth()]}`
  }
  if (c.end.kind === "after") out += c.end.count === 1 ? ", once" : `, ${c.end.count} times`
  if (c.end.kind === "on") out += `, until ${longDate(c.end.date)}`
  return out
}

export { isInstanceId, seriesIdOf } from "@/lib/calendar/instanceId"
