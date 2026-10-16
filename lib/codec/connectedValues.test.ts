import { describe, expect, it } from "vitest"
import { dateWords, isoDate } from "./connectedValues"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

describe("a day kept in a doc", () => {
  it("is a day on the calendar, or none", () => {
    expect(isoDate("2026-10-12")).toBe("2026-10-12")
    expect(isoDate("2028-02-29")).toBe("2028-02-29")
    for (const none of ["2026-02-30", "2026-13-01", "2026-1-2", "12 Oct", 20261012, null]) expect(isoDate(none)).toBe("")
  })

  it("is written in words for a reader without the app, and a day that is none in none", () => {
    expect(dateWords("2026-10-01")).toBe("1 Oct 2026")
    expect(dateWords("2026-02-30")).toBe("")
  })
})
