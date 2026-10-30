import { format } from "date-fns"
import { dayAndTime } from "@/lib/utils/date/clock"
import { dayDate } from "@/lib/utils/timeZone"
import type { SearchEventHit } from "@/services/searchService"

/**
 * When an event search found happens, in the reader's own time and the one
 * way the app writes a meeting's day and time (dayAndTime): "Thu 29 Oct,
 * 10:00 AM – 11:00 AM". An all-day event is its days alone, "Fri 30 Oct" or
 * "Fri 30 Oct – Sun 1 Nov" (its end date is the day after its last). A
 * series says its first. "" when the hit says neither. Pure.
 */
export function eventWhen(e: SearchEventHit | undefined): string {
  if (!e) return ""
  if (e.event_start) return dayAndTime(new Date(e.event_start * 1000), e.event_end ? new Date(e.event_end * 1000) : undefined)
  const first = dayDate(e.event_start_date)
  if (!first) return ""
  const after = dayDate(e.event_end_date)
  const last = after ? new Date(after.getFullYear(), after.getMonth(), after.getDate() - 1) : first
  return last > first ? `${format(first, "EEE d MMM")} – ${format(last, "EEE d MMM")}` : format(first, "EEE d MMM")
}
