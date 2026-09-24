import { format, isSameDay, addDays } from "date-fns"

// One phrase for when something is due, in the viewer's own time zone.
//
// The attention list used to show a "Due soon" chip beside "Due Sep 24, 5:00 PM",
// saying due twice, with the time formatted on the server in the server's zone.
// The backend now sends the moment itself; this says it once, where the reader is.

/** "Due today, 5:00 PM", "Due tomorrow, 9:00 AM", "Due Sep 30" or "Was due Sep 2".
 *  Empty when the moment cannot be read, so the caller falls back. Pure. */
export function dueLabel(iso: string | undefined, now: Date): string {
  if (!iso) return ""
  const due = new Date(iso)
  if (Number.isNaN(due.getTime())) return ""
  if (due < now) {
    return isSameDay(due, now) ? `Was due ${format(due, "h:mm a")}` : `Was due ${format(due, "MMM d")}`
  }
  if (isSameDay(due, now)) return `Due today, ${format(due, "h:mm a")}`
  if (isSameDay(due, addDays(now, 1))) return `Due tomorrow, ${format(due, "h:mm a")}`
  return `Due ${format(due, "MMM d")}`
}
