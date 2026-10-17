/**
 * The one clock (owner's rule, 12 Oct 2026): a time of day is written the way
 * the reader's own locale writes it, through Intl.DateTimeFormat with their
 * locale and hour cycle. "9:15 AM" in an American browser, "09:15" in a
 * British one, "9:15 am" in an Indian one.
 *
 * Home said "Standup at 09:15" (a fixed 24-hour clock) while the shell's foot,
 * chat and the calendar said "8:08 AM" in the same browser. Every time of day
 * goes through here now, and app/clockTimes.test.ts fails on one written by
 * hand (toLocaleTimeString, a date-fns "h:mm a", padded hours).
 *
 * A person's own choice wins: the booking page's "Use 24-hour time" switch is
 * passed as `hour12`. There is no account-wide setting yet; one would be passed
 * the same way.
 *
 * Dates keep their one written form (lib/utils/date/shortDate): "9 Oct".
 */

import { format } from "date-fns"

interface ClockOptions {
  /** The IANA zone to read the moment in; the device's own when absent. */
  timeZone?: string
  /** The person's choice: true for a 12-hour clock, false for 24 hours. The locale's own when absent. */
  hour12?: boolean
  /** The locale to write in; the reader's own when absent (tests pin one). */
  locale?: string
  /**
   * The month grid's short form, where a bar holds a time and a title: "9:30am"
   * and "2pm" on a 12-hour clock (no space, no ":00"), the usual "14:00" on a
   * 24-hour one.
   */
  compact?: boolean
  /**
   * The time without its day period ("10:46"), where an axis beside it already
   * says AM or PM: the week view's now pill.
   */
  bare?: boolean
}

type Moment = Date | string | number

/** "17:00": a wall-clock time, as a time input and the API keep one (a check-in, working hours), with no day and no zone. */
const WALL = /^([01]?\d|2[0-3]):([0-5]\d)$/

/**
 * A moment as a Date, and the options to write it with. A number is the API's
 * seconds since the epoch, as messages carry them; one too large to be
 * seconds (until the year 5138) is already milliseconds. A wall-clock time is
 * written as it is, in no zone.
 */
function read(value: Moment, o: ClockOptions): [Date, ClockOptions] {
  // Any Date, not only this realm's: instanceof misses one made before a
  // test pinned the clock (a mocked Date class) or in another frame.
  if (typeof value === "object") return [value, o]
  if (typeof value === "number") return [new Date(value < 1e11 ? value * 1000 : value), o]
  const wall = WALL.exec(value.trim())
  if (wall) return [new Date(2000, 0, 1, Number(wall[1]), Number(wall[2])), { ...o, timeZone: undefined }]
  return [new Date(value), o]
}

const formatters = new Map<string, Intl.DateTimeFormat>()
const kept = new Map<string, Intl.DateTimeFormat>()

/**
 * The app's one cache of date formatters, by locale and options. Building one
 * is the costly part: the booking page built some 1,800 on load, one per slot,
 * label and render (CAL-BUG-20). A zone the runtime doesn't know throws, as
 * the constructor does, and isn't kept.
 */
export function dateTimeFormat(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ""}|${JSON.stringify(opts)}`
  let f = kept.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts)
    kept.set(key, f)
  }
  return f
}

/**
 * The formatter for a time ("time") or an hour on its own ("hour"), made once
 * per locale, zone and choice: a message list writes hundreds of times.
 *
 * With no choice made, a time is the locale's own short pattern (timeStyle
 * "short"), exactly as the reader's system writes it. A choice gives the hour
 * cycle by name, never `hour12`: `hour12: true` reads as an 11-hour clock in
 * some locales ("0:30 pm" for half past twelve in en-GB).
 */
function formatter(kind: "time" | "hour" | "day", o: ClockOptions): Intl.DateTimeFormat {
  const key = `${kind}|${o.locale ?? ""}|${o.timeZone ?? ""}|${o.hour12 ?? ""}`
  let f = formatters.get(key)
  if (f) return f
  const opts: Intl.DateTimeFormatOptions =
    kind === "day"
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : o.hour12 === undefined
        ? kind === "time"
          ? { timeStyle: "short" }
          : { hour: "numeric" }
        : o.hour12
          ? { hour: "numeric", ...(kind === "time" ? { minute: "2-digit" } : {}), hourCycle: "h12" }
          : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
  try {
    f = dateTimeFormat(o.locale, { ...opts, timeZone: o.timeZone })
  } catch {
    // A zone the runtime doesn't know: the device's own clock, not a crash.
    f = dateTimeFormat(o.locale, opts)
  }
  formatters.set(key, f)
  return f
}

/**
 * One spacing everywhere: ICU writes a narrow no-break space before "AM" and
 * thin spaces round a range's dash, where V8's format() gives a plain space.
 * A time keeps its words together, so "2:00 PM" never ends one line and starts
 * the next (Home's greeting broke there at 390): a no-break space inside a
 * time, plain spaces round a range's dash, where a span may wrap.
 */
const NBSP = "\u00a0"
const tidy = (s: string) => s.trim().replace(/\s+/g, NBSP).replace(/\u00a0([–—-])\u00a0/g, " $1 ")

const valid = (d: Date) => !Number.isNaN(d.getTime())

/** Whether the reader writes a 12-hour clock (an AM/PM after the time), or the choice they made. */
export function readsTwelveHour(o: ClockOptions = {}): boolean {
  if (o.hour12 !== undefined) return o.hour12
  const cycle = formatter("hour", o).resolvedOptions().hourCycle
  return cycle === "h12" || cycle === "h11"
}

/**
 * A time of day: "9:15 AM", "09:15" or "9:15 am", as the reader writes it. It
 * takes a Date, an ISO string, the API's seconds or a wall-clock "17:00"; ""
 * for a moment that can't be read.
 */
export function clockTime(value: Moment, options: ClockOptions = {}): string {
  const [d, o] = read(value, options)
  if (!valid(d)) return ""
  if (o.bare) return tidy(formatter("time", o).formatToParts(d).filter((p) => p.type !== "dayPeriod").map((p) => p.value).join(""))
  if (!o.compact || !readsTwelveHour(o)) return tidy(formatter("time", o).format(d))
  let out = ""
  for (const p of formatter("time", o).formatToParts(d)) {
    if (p.type === "minute" && p.value === "00") out = out.replace(/[:.]$/, "")
    else if (p.type === "dayPeriod") out = out.trimEnd() + p.value.toLowerCase().replace(/\./g, "")
    else out += p.value
  }
  return tidy(out)
}

/**
 * An hour on a time axis: "9 AM" on a 12-hour clock, "09:00" on a 24-hour
 * one (a bare "09" reads as a count, not a time).
 */
export function clockHour(value: Moment, options: ClockOptions = {}): string {
  const [d, o] = read(value, options)
  if (!valid(d)) return ""
  return readsTwelveHour(o) ? tidy(formatter("hour", o).format(d)) : clockTime(d, o)
}

/**
 * A span of time, its day period said once where the locale shares it: "9:30 –
 * 10:15 AM", "11:30 AM – 12:30 PM", "09:30–10:15". A span that crosses
 * midnight names both ends in full ("11:00 PM – 12:00 AM"), never the dates
 * Intl adds. A span of a day or more on the wall clock says each end's day
 * ("Thu 09:30 – Fri 09:30"): its two clocks alone could read the same (PTC-9),
 * on a day the clocks change as on any other.
 */
export function clockRange(start: Moment, end: Moment, options: ClockOptions = {}): string {
  const [a, o] = read(start, options)
  const [b] = read(end, options)
  if (!valid(a) || !valid(b)) return ""
  const day = formatter("day", o)
  if (b < a || day.format(a) !== day.format(b)) {
    // A day or more on the wall clock: 23 hours on a day the clocks go forward.
    if (b > a && wallClock(b, o) - wallClock(a, o) >= DAY_MS) return `${weekday(a, o)}${NBSP}${clockTime(a, o)} – ${weekday(b, o)}${NBSP}${clockTime(b, o)}`
    return `${clockTime(a, o)} – ${clockTime(b, o)}`
  }
  return tidy(formatter("time", o).formatRange(a, b))
}

const DAY_MS = 24 * 60 * 60 * 1000
const WALL_CLOCK: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }

/** A moment's wall clock in the zone it is read in, on a clock with no zone (milliseconds), where every day is 24 hours long. */
function wallClock(d: Date, o: ClockOptions): number {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = dateTimeFormat("en-US", { ...WALL_CLOCK, timeZone: o.timeZone }).formatToParts(d)
  } catch {
    // A zone the runtime doesn't know: the device's own clock, as clockTime falls back.
    parts = dateTimeFormat("en-US", WALL_CLOCK).formatToParts(d)
  }
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"))
}

/** A moment's day of the week in the app's words ("Thu", as dates are written), in the zone it is read in. */
function weekday(d: Date, o: ClockOptions): string {
  try {
    return dateTimeFormat("en-GB", { weekday: "short", timeZone: o.timeZone }).format(d)
  } catch {
    // A zone the runtime doesn't know: the device's own day, as clockTime falls back.
    return dateTimeFormat("en-GB", { weekday: "short" }).format(d)
  }
}

/**
 * A meeting's day and time in words, the one way the app writes them: "Wed 14
 * Oct, 10:00 AM", "Wed 14 Oct, 10:00 AM – 10:30 AM", or with the end's day
 * too when it falls on another ("…, 11:00 PM – Thu 15 Oct, 1:00 AM").
 */
export function dayAndTime(start: Date, end?: Date): string {
  const first = `${format(start, "EEE d MMM")}, ${clockTime(start)}`
  if (!end || Number.isNaN(end.getTime())) return first
  const sameDay = start.toDateString() === end.toDateString()
  return `${first} – ${sameDay ? "" : `${format(end, "EEE d MMM")}, `}${clockTime(end)}`
}

