import { describe, expect, it } from "vitest"
import { clockTime } from "./clock"
import { fullDateTime, shortDate, shortDateTime } from "./shortDate"

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
  // The time is the reader's own clock (./clock.test.ts holds its rules); the
  // test runs in an American locale, where it reads "3:10 PM".
  const now = new Date(2026, 9, 10)
  it("writes a day and its time as 9 Oct, 3:10 PM", () => {
    expect(shortDateTime(new Date(2026, 9, 9, 15, 10), now)).toBe(`9 Oct, ${clockTime(new Date(2026, 9, 9, 15, 10))}`)
    expect(shortDateTime(new Date(2025, 9, 9, 15, 10), now)).toBe(`9 Oct 2025, ${clockTime(new Date(2025, 9, 9, 15, 10))}`)
  })
  it("writes all of it for a tooltip", () => {
    expect(fullDateTime(new Date(2026, 9, 9, 15, 10))).toBe(`Friday 9 October 2026, ${clockTime(new Date(2026, 9, 9, 15, 10))}`)
  })
})
