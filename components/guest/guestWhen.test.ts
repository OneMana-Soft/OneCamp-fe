import { describe, expect, it } from "vitest"
import { guestWhen } from "./guestUi"

// Guest times read "Fri 3:10 PM", which is right for this week and wrong for
// anything older: earlier messages and a task's comments can be weeks old, and
// a weekday alone put them in the last few days.
const now = new Date(2026, 9, 10, 12, 0) // Sat 10 Oct 2026, noon, local time
const at = (y: number, m: number, d: number, h = 15, min = 10) => new Date(y, m, d, h, min).toISOString()

describe("when a guest message was written", () => {
  it("names the weekday within the last few days", () => {
    expect(guestWhen(at(2026, 9, 9), now)).toBe("Fri 3:10 PM")
    expect(guestWhen(at(2026, 9, 5), now)).toBe("Mon 3:10 PM")
  })

  it("gives the date once it is a week or more old", () => {
    expect(guestWhen(at(2026, 8, 1), now)).toBe("1 Sep, 3:10 PM")
    expect(guestWhen(at(2026, 9, 3), now)).toBe("3 Oct, 3:10 PM")
  })

  it("adds the year when it isn't this one", () => {
    expect(guestWhen(at(2025, 11, 30), now)).toBe("30 Dec 2025, 3:10 PM")
  })
})
