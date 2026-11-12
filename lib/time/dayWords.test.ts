import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { hourOn, monthDate, plainWords, readTime, weekdayDate } from "@/lib/time/dayWords"
import { nextMonday } from "@/lib/messages/schedulePresets"

// The one reader of day and time words (CR-B9 M1), which Remind me's words
// (lib/time/whenWords) and the calendar's quick create (lib/calendar/
// parseEventText) both read through. Each reader's own table pins the phrases.

// Thursday 15 Oct 2026, 10:00 on this machine's clock.
const THU = new Date(2026, 9, 15, 10, 0)
pinTestClock(THU)

const day = (d: number, m = 10, y = 2026) => new Date(y, m - 1, d)

describe("day and time words", () => {
  it("counts next week from Monday, a week on from a Monday, as Later's Next week and Send later's Monday do", () => {
    // Sunday 18 Oct to Saturday 24 Oct.
    const want = [19, 26, 26, 26, 26, 26, 26]
    for (let i = 0; i < 7; i++) expect(nextMonday(new Date(2026, 9, 18 + i, 15, 30)), `18+${i}`).toEqual(new Date(2026, 9, want[i]))
  })

  it("reads a weekday as the coming one, this week's said with this, next week's said with next", () => {
    expect(weekdayDate(THU, 4)).toEqual(day(22))
    expect(weekdayDate(THU, 4, "this")).toEqual(day(15))
    expect(weekdayDate(THU, 4, "on")).toEqual(day(22))
    expect(weekdayDate(THU, 5)).toEqual(day(16))
    expect(weekdayDate(THU, 5, "next")).toEqual(day(23))
    expect(weekdayDate(THU, 0, "next")).toEqual(day(25))
  })

  it("reads a month's day as this year's until it has gone, and says no day for one its month hasn't", () => {
    expect(monthDate(THU, 9, 15)).toEqual(day(15))
    expect(monthDate(THU, 9, 14)).toEqual(day(14, 10, 2027))
    expect(monthDate(THU, 11, 3, 2028)).toEqual(day(3, 12, 2028))
    expect(monthDate(THU, 1, 30)).toBeNull()
    expect(monthDate(THU, 3, 31)).toBeNull()
  })

  it("reads an hour as the working day's, and as the evening's on an evening's day", () => {
    const at = (s: string, evening?: boolean) => {
      const t = readTime(plainWords(s))
      return t && `${hourOn(t, evening)}:${String(t.minute).padStart(2, "0")}`
    }
    expect(["9", "3", "7:30", "07:30", "13", "at 2 P.M.", "noon", "midnight", "12am", "12pm", "14.30"].map((s) => at(s))).toEqual([
      "9:00", "15:00", "19:30", "7:30", "13:00", "14:00", "12:00", "0:00", "0:00", "12:00", "14:30",
    ])
    expect(["9", "9am", "3", "11"].map((s) => at(s, true))).toEqual(["21:00", "9:00", "15:00", "23:00"])
    for (const s of ["25", "13pm", "0am", "9:60", "nine"]) expect(readTime(plainWords(s)), s).toBeNull()
  })
})
