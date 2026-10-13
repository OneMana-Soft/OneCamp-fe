import { format } from "date-fns"
import { shortTime } from "@/lib/utils/date/shortDate"

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
 * A meeting's day and time in words, the one way the app writes them: "Wed 14
 * Oct, 10:00 AM", "Wed 14 Oct, 10:00 AM – 10:30 AM", or with the end's day
 * too when it falls on another ("…, 11:00 PM – Thu 15 Oct, 1:00 AM"). The
 * time is the app's one written form (lib/utils/date/shortDate).
 */
export function dayAndTime(start: Date, end?: Date): string {
  const first = `${format(start, "EEE d MMM")}, ${shortTime(start)}`
  if (!end || Number.isNaN(end.getTime())) return first
  const sameDay = start.toDateString() === end.toDateString()
  return `${first} – ${sameDay ? "" : `${format(end, "EEE d MMM")}, `}${shortTime(end)}`
}
