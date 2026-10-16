import { describe, expect, it } from "vitest"
import { describeSchedule, nextLabel } from "@/lib/checkins"

describe("check-ins", () => {
  // On the reader's clock (lib/utils/date/clock); the tests run in an American locale.
  it("says when a check-in asks the way people say it", () => {
    expect(describeSchedule([1, 2, 3, 4, 5], "17:00")).toBe("Weekdays at 5:00\u00a0PM")
    expect(describeSchedule([1], "09:30")).toBe("Mondays at 9:30\u00a0AM")
    expect(describeSchedule([5, 1, 3], "17:00")).toBe("Mon, Wed and Fri at 5:00\u00a0PM")
    expect(describeSchedule([1, 2, 3, 4, 5, 6, 7], "08:00")).toBe("Every day at 8:00\u00a0AM")
    expect(describeSchedule([6, 7], "11:00")).toBe("Weekends at 11:00\u00a0AM")
    expect(describeSchedule([2, 4], "10:00")).toBe("Tue and Thu at 10:00\u00a0AM")
  })
  it("reads the next time in the reader's calendar", () => {
    expect(nextLabel("2026-10-08T11:30:00Z")).toMatch(/^Thu 8 Oct, \d{1,2}:\d{2}\u00a0(AM|PM)$/)
    expect(nextLabel(undefined)).toBeUndefined()
    expect(nextLabel("nonsense")).toBeUndefined()
  })
})
