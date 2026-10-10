import { describe, expect, it } from "vitest"
import { fullDateTime, shortDate, shortDateTime, shortTime } from "./shortDate"

describe("shortDate", () => {
  const now = new Date(2026, 9, 10)
  it("drops the year and the leading zero for this year", () => {
    expect(shortDate(new Date(2026, 9, 7), now)).toBe("7 Oct")
  })
  it("keeps the year for another year", () => {
    expect(shortDate(new Date(2025, 11, 30), now)).toBe("30 Dec 2025")
  })
})

describe("the times that go with it", () => {
  const now = new Date(2026, 9, 10)
  it("writes a time as 3:10 PM, with no leading zero and a plain space", () => {
    expect(shortTime(new Date(2026, 9, 10, 15, 10))).toBe("3:10 PM")
    expect(shortTime(new Date(2026, 9, 10, 9, 5))).toBe("9:05 AM")
    expect(shortTime(new Date(2026, 9, 10, 0, 30))).toBe("12:30 AM")
  })
  it("writes a day and its time as 9 Oct, 3:10 PM", () => {
    expect(shortDateTime(new Date(2026, 9, 9, 15, 10), now)).toBe("9 Oct, 3:10 PM")
    expect(shortDateTime(new Date(2025, 9, 9, 15, 10), now)).toBe("9 Oct 2025, 3:10 PM")
  })
  it("writes all of it for a tooltip", () => {
    expect(fullDateTime(new Date(2026, 9, 9, 15, 10))).toBe("Friday 9 October 2026, 3:10 PM")
  })
})
