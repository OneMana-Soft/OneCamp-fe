import { describe, expect, it } from "vitest"
import { focusEventFor } from "./useStartFocus"

// Focus time is a calendar event marked as focus; starting it from the chrome
// is creating one from now. The server reads the pause from it.
describe("starting focus time", () => {
  it("is a focus event from now for an hour, on nobody else's calendar", () => {
    const now = new Date("2026-10-11T10:00:00Z")
    const e = focusEventFor(now)
    expect(e).toMatchObject({ title: "Focus time", isFocus: true, isAway: false, participants: [], syncToGoogleCalendar: false })
    expect(e.startTime).toBe("2026-10-11T10:00:00.000Z")
    expect(e.endTime).toBe("2026-10-11T11:00:00.000Z")
  })
})
