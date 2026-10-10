import { describe, expect, it } from "vitest"
import { describeSchedule, nextLabel } from "@/lib/checkins"

describe("check-ins", () => {
  it("says when a check-in asks the way people say it", () => {
    expect(describeSchedule([1, 2, 3, 4, 5], "17:00")).toBe("Weekdays at 17:00")
    expect(describeSchedule([1], "09:30")).toBe("Mondays at 09:30")
    expect(describeSchedule([5, 1, 3], "17:00")).toBe("Mon, Wed and Fri at 17:00")
    expect(describeSchedule([1, 2, 3, 4, 5, 6, 7], "08:00")).toBe("Every day at 08:00")
    expect(describeSchedule([6, 7], "11:00")).toBe("Weekends at 11:00")
    expect(describeSchedule([2, 4], "10:00")).toBe("Tue and Thu at 10:00")
  })
  it("reads the next time in the reader's calendar", () => {
    expect(nextLabel("2026-10-08T11:30:00Z")).toMatch(/^Thu 8 Oct, \d{1,2}:\d{2} (AM|PM)$/)
    expect(nextLabel(undefined)).toBeUndefined()
    expect(nextLabel("nonsense")).toBeUndefined()
  })
})
