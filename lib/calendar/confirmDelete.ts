import { bookedMeetingConfirm, type BookedConfirm, type EventBooking } from "@/lib/calendar/bookedMeeting"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * The question before an event is deleted, wherever it is deleted from: the
 * event's panel, the calendar's Delete key and its menu. A booked meeting
 * names its guest and whether they'll be told (CAL-BUG-4). Pure.
 */
export function deleteEventConfirm(event: { event_booking?: EventBooking }): BookedConfirm {
  return event.event_booking
    ? bookedMeetingConfirm(event.event_booking, "delete")
    : { title: "Delete this event?", description: "It's removed from everyone's calendar. This can't be undone.", confirmText: "Delete event" }
}

/**
 * The request that deletes an event, once it is confirmed, from the same three
 * places: one address, and a refusal that says what didn't happen with the
 * server's reason under it. Pure.
 */
export function deleteEventRequest(eventUuid: string) {
  return {
    method: "DELETE",
    apiEndpoint: PostEndpointUrl.DeleteCalendarEvent,
    appendToUrl: `/${eventUuid}`,
    showErrorToast: true,
    failureTitle: "Couldn't delete the event",
  } as const
}
