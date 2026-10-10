import { describe, expect, it } from "vitest"
import { shortDate } from "./shortDate"

describe("shortDate", () => {
  const now = new Date(2026, 9, 10)
  it("drops the year and the leading zero for this year", () => {
    expect(shortDate(new Date(2026, 9, 7), now)).toBe("7 Oct")
  })
  it("keeps the year for another year", () => {
    expect(shortDate(new Date(2025, 11, 30), now)).toBe("30 Dec 2025")
  })
})
