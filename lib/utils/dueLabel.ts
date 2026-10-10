import { isSameDay, addDays } from "date-fns"
import { shortDate, shortTime } from "@/lib/utils/date/shortDate"

// One phrase for when something is due, in the viewer's own time zone.
//
// The attention list used to show a "Due soon" chip beside "Due Sep 24, 5:00 PM",
// saying due twice, with the time formatted on the server in the server's zone.
// The backend now sends the moment itself; this says it once, where the reader is.

/** "Due today, 5:00 PM", "Due tomorrow, 9:00 AM", "Due 30 Sep" or "Was due 2 Sep",
 *  in the app's one date format (lib/utils/date/shortDate).
 *  Empty when the moment cannot be read, so the caller falls back. Pure. */
export function dueLabel(iso: string | undefined, now: Date): string {
  if (!iso) return ""
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) return ""
  if (due < now) {
    return isSameDay(due, now) ? `Was due ${shortTime(due)}` : `Was due ${shortDate(due, now)}`
  }
  if (isSameDay(due, now)) return `Due today, ${shortTime(due)}`
  if (isSameDay(due, addDays(now, 1))) return `Due tomorrow, ${shortTime(due)}`
  return `Due ${shortDate(due, now)}`
}
