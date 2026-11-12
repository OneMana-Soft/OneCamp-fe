import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { guestsOf, tellOfMove } from "./tellGuests"

pinTestClock()

// CAL-11: a move on the grid asks what the Event Form's save asks, by the same rule (tellOf).
describe("what a move on the grid tells guests", () => {
  const at = (h: number) => new Date(2026, 9, 19, h)
  const review = (guests: { user_uuid?: string; email?: string }[]) => ({
    event_title: "Design review",
    event_start_time: at(10).toISOString(),
    event_end_time: at(11).toISOString(),
    event_created_by: { user_uuid: "me" },
    event_guests: guests.map((g) => ({ ...g, role: "required", response: "needs_action" })),
  })

  it("reads an event's guests, members by uuid and guests by email, its organiser left out", () => {
    expect(guestsOf(review([{ user_uuid: "me" }, { user_uuid: "maya" }, { email: "alex@example.com" }]))).toEqual({ members: ["maya"], emails: ["alex@example.com"] })
    expect(guestsOf({})).toEqual({ members: [], emails: [] })
  })

  it("asks to send a change when anyone else is on it, and nothing when the move moves nothing or nobody would hear", () => {
    expect(tellOfMove(review([{ email: "alex@example.com" }]), at(12), at(13))).toBe("change")
    expect(tellOfMove(review([{ user_uuid: "maya" }]), at(12), at(13))).toBe("change")
    expect(tellOfMove(review([{ user_uuid: "me" }]), at(12), at(13))).toBeNull()
    expect(tellOfMove(review([{ email: "alex@example.com" }]), at(10), at(11))).toBeNull()
  })
})
