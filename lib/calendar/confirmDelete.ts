import { CalendarPost } from "@/services/endpoints/calendar"

/**
 * The /event route's delete (the old stores', lib/calendar/deleteEvent): one address,
 * and a refusal that says what didn't happen with the server's reason under
 * it. Pure.
 */
export function deleteEventRequest(eventUuid: string) {
  return {
    method: "DELETE",
    apiEndpoint: CalendarPost.DeleteCalendarEvent,
    appendToUrl: `/${eventUuid}`,
    showErrorToast: true,
    failureTitle: "Couldn't delete the event",
  } as const
}
