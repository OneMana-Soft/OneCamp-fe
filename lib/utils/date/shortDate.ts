import { clockTime } from "@/lib/utils/date/clock"
import { fullDate, shortDate } from "@/lib/utils/date/dateWords"

// A day (dateWords) with the reader's own clock: "3:10 PM" in an American browser, "15:10" in a British one.
export { agoOrDate, fullDate, shortDate } from "@/lib/utils/date/dateWords"

/** "9 Oct, 3:10 PM", with the year when it isn't this one. */
export function shortDateTime(d: Date, now: Date = new Date()): string {
  return `${shortDate(d, now)}, ${clockTime(d)}`
}

/** For a tooltip or a screen reader: "Friday 9 October 2026, 3:10 PM". */
export function fullDateTime(d: Date): string {
  return `${fullDate(d)}, ${clockTime(d)}`
}
