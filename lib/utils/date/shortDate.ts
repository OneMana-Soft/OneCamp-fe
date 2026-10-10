import { format } from "date-fns"

/**
 * A day as a task list shows it: "7 Oct" this year, "7 Oct 2025" in another.
 * The lists printed "07 Oct 2026" in every row: a zero nobody reads and a year
 * that is nearly always this one, in a column whose job is to be scanned.
 */
export function shortDate(d: Date, now: Date = new Date()): string {
  return format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy")
}
