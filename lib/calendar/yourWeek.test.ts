import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { hm, usualWords, weekParts, yourWeekPath, type WeekInsights } from "./yourWeek"

pinTestClock()

const week = (over: Partial<WeekInsights> = {}): WeekInsights => ({
  from: "2026-10-26T00:00:00Z", to: "2026-11-02T00:00:00Z",
  meeting_minutes: 150, one_on_one_minutes: 60, group_minutes: 120, meetings: 3, average_meeting_minutes: 60,
  focus_minutes: 90, own_minutes: 0, away_minutes: 0, has_hours: true, working_minutes: 960, free_minutes: 720,
  to_answer: 1, usual_meeting_minutes: 300, people: [], ...over,
})

describe("Your week", () => {
  it("asks for the seven days from the week's start", () => {
    const start = new Date(Date.UTC(2026, 9, 26))
    expect(yourWeekPath(start)).toBe("/calendar/insights?from=2026-10-26T00%3A00%3A00.000Z&to=2026-11-02T00%3A00%3A00.000Z")
  })

  it("says minutes as hours and minutes", () => {
    expect([hm(0), hm(45), hm(60), hm(150), hm(-5)]).toEqual(["0m", "45m", "1h", "2h 30m", "0m"])
  })

  it("puts this week beside the usual one, and says nothing with no usual week", () => {
    expect(usualWords(week())).toBe("2h 30m less than usual")
    expect(usualWords(week({ meeting_minutes: 400 }))).toBe("1h 40m more than usual")
    expect(usualWords(week({ meeting_minutes: 310 }))).toBe("About your usual week")
    expect(usualWords(week({ usual_meeting_minutes: 0 }))).toBeNull()
  })

  it("draws only the parts with time, and free time only with working hours", () => {
    expect(weekParts(week()).map((p) => p.key)).toEqual(["one", "group", "focus", "free"])
    expect(weekParts(week({ has_hours: false })).map((p) => p.key)).toEqual(["one", "group", "focus"])
  })
})
