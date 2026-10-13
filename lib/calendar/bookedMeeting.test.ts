import { describe, expect, it } from "vitest"
import { bookedMeetingConfirm } from "./bookedMeeting"

// CAL-BUG-4: deleting or moving a booked meeting names its guest, and says
// whether they'll be told.
const alex = { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true }

describe("a booked meeting's confirmation", () => {
  it("names the guest and the page, and says they'll be emailed", () => {
    expect(bookedMeetingConfirm(alex, "delete")).toEqual({
      title: "Delete this booked meeting?",
      description: "Alex Kim booked it through Intro call. We'll email them that it's cancelled.",
      confirmText: "Delete and tell Alex Kim",
    })
    expect(bookedMeetingConfirm(alex, "move", "Thu 15 Oct, 10:30 – 11:00")).toEqual({
      title: "Move this booked meeting?",
      description: "Alex Kim booked it through Intro call. We'll email them the new time, Thu 15 Oct, 10:30 – 11:00.",
      confirmText: "Move and tell Alex Kim",
    })
  })

  it("says plainly when the guest can't be told", () => {
    const quiet = bookedMeetingConfirm({ ...alex, guest_told: false }, "delete")
    expect(quiet.description).toBe("Alex Kim booked it through Intro call. They won't be told: this workspace doesn't send email, so let them know yourself.")
    expect(quiet.confirmText).toBe("Delete meeting")
    expect(bookedMeetingConfirm({ ...alex, guest_told: false }, "move").confirmText).toBe("Move meeting")
  })
})
