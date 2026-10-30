import { describe, expect, it } from "vitest"
import { spanLabel } from "./spanLabel"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// DESIGN-BUILD-3, 20 Oct 2026: a week's block lost its PM ("Pricing call
// 11:00 AM – 12:00 …"). Across noon the calendar says a whole hour as Google
// does; a span within the morning or the afternoon reads as it did.
describe("an event's span on the calendar", () => {
  it("drops a whole hour's :00 when it crosses noon", () => {
    expect(spanLabel(new Date(2026, 9, 12, 11, 0), new Date(2026, 9, 12, 12, 0))).toBe("11 AM – 12 PM")
    expect(spanLabel(new Date(2026, 9, 12, 11, 30), new Date(2026, 9, 12, 13, 0))).toBe("11:30 AM – 1 PM")
  })

  it("reads as the shared clock writes it otherwise", () => {
    expect(spanLabel(new Date(2026, 9, 12, 10, 0), new Date(2026, 9, 12, 11, 0))).toBe("10:00 – 11:00 AM")
    expect(spanLabel(new Date(2026, 9, 12, 23, 0), new Date(2026, 9, 13, 0, 0))).toBe("11:00 PM – 12:00 AM")
  })
})
