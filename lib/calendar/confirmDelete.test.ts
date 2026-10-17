import { describe, expect, it } from "vitest"
import { bookedMeetingConfirm } from "./bookedMeeting"
import { deleteEventConfirm, deleteEventRequest } from "./confirmDelete"

describe("the question before an event is deleted", () => {
  it("says it goes from everyone's calendar, for good", () => {
    expect(deleteEventConfirm({})).toEqual({ title: "Delete this event?", description: "It's removed from everyone's calendar. This can't be undone.", confirmText: "Delete event" })
  })

  it("names a booked meeting's guest, and whether they'll be told", () => {
    const booking = { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true }
    expect(deleteEventConfirm({ event_booking: booking })).toEqual(bookedMeetingConfirm(booking, "delete"))
  })
})

describe("the request that deletes an event", () => {
  it("goes to the event's own address, and a refusal says what didn't happen", () => {
    const request = deleteEventRequest("e1")
    expect(`${request.apiEndpoint}${request.appendToUrl}`).toBe("/event/deleteEvent/e1")
    expect(request).toMatchObject({ method: "DELETE", showErrorToast: true, failureTitle: "Couldn't delete the event" })
  })
})
