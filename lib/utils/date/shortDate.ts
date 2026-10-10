import { format } from "date-fns"

// The one way the app writes a date and a time: "9 Oct" this year and
// "9 Oct 2025" in another, and "3:10 PM". Day before month, as most of the
// world reads it: the messages said "Oct 9" (the US order) and some screens
// "09/10/26", which reads as the 10th of September to half the world. Spelled
// out here rather than left to the browser's locale, so one moment reads the
// same in every list, message and tooltip, on every machine.

/**
 * A day as a list shows it: "7 Oct" this year, "7 Oct 2025" in another.
 * The lists printed "07 Oct 2026" in every row: a zero nobody reads and a year
 * that is nearly always this one, in a column whose job is to be scanned.
 */
export function shortDate(d: Date, now: Date = new Date()): string {
  return format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy")
}

/** A time of day: "3:10 PM", with no leading zero on the hour. */
export function shortTime(d: Date): string {
  return format(d, "h:mm a")
}

/** A day and its time: "9 Oct, 3:10 PM", with the year when it isn't this one. */
export function shortDateTime(d: Date, now: Date = new Date()): string {
  return `${shortDate(d, now)}, ${shortTime(d)}`
}

/** All of it, for a tooltip or a screen reader: "Friday 9 October 2026, 3:10 PM". */
export function fullDateTime(d: Date): string {
  return format(d, "EEEE d MMMM yyyy, h:mm a")
}
