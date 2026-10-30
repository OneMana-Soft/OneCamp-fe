import { GetEndpointUrl } from "@/services/endPoints"

/**
 * Whether a cached answer shows the calendar's events: any list of them, or
 * the one event `eventId` names (and its instances). What reads again when an
 * event changes elsewhere: a notice about it (calendar A2), or focus time
 * started or ended from the app's chrome.
 */
export function showsEvent(key: unknown, eventId: unknown): boolean {
  if (typeof key !== "string") return false
  if (key.startsWith(GetEndpointUrl.GoogleCalendarEvents)) return true
  const id = typeof eventId === "string" ? eventId : ""
  return !!id && (key.startsWith(`${GetEndpointUrl.GetEvent}/${id}`) || key.startsWith(`/calendar/events/${id}`))
}
