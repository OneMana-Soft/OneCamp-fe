import { afterEach, describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { formatSendAt, sendLaterProblem } from "@/lib/messages/schedulePresets"
import { setAccountClock } from "@/lib/utils/date/clock"
import { parseWhen } from "@/lib/time/whenWords"

// When, in words (H3; linear-45 #1): a time typed the way it is said, read
// against a fixed now, in the browser's own zone. Each phrase lands on one
// moment, and its words are the app's one way of saying a moment
// (formatSendAt, on the person's clock). A bare day lands at Later's morning
// hour (9:00); an hour alone is the working day's, as the calendar reads one.

// Thursday 15 Oct 2026, 10:00 on this machine's clock.
const THU = new Date(2026, 9, 15, 10, 0)
// A month's last evening: Saturday 31 Oct 2026, 22:00.
const MONTH_END = new Date(2026, 9, 31, 22, 0)
// A year's last afternoon: Thursday 31 Dec 2026, 15:00.
const YEAR_END = new Date(2026, 11, 31, 15, 0)

pinTestClock(THU)
afterEach(() => setAccountClock(undefined))

const on = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min)

const TABLE: [now: Date, text: string, at: Date][] = [
  [THU, "tomorrow", on(2026, 10, 16)],
  [THU, "tomorrow 9", on(2026, 10, 16, 9)],
  [THU, "tomorrow at 9am", on(2026, 10, 16, 9)],
  [THU, "Tomorrow at 2:30 pm", on(2026, 10, 16, 14, 30)],
  [THU, "9am tomorrow", on(2026, 10, 16, 9)],
  [THU, "tonight", on(2026, 10, 15, 20)],
  [THU, "tonight at 9", on(2026, 10, 15, 21)],
  [THU, "this evening", on(2026, 10, 15, 18)],
  [THU, "in 20 minutes", on(2026, 10, 15, 10, 20)],
  [THU, "in an hour", on(2026, 10, 15, 11)],
  [THU, "in 2 hours", on(2026, 10, 15, 12)],
  [THU, "in 3 days", on(2026, 10, 18, 10)],
  [THU, "in 2 weeks", on(2026, 10, 29, 10)],
  [THU, "monday", on(2026, 10, 19)],
  [THU, "next monday", on(2026, 10, 19)],
  [THU, "friday", on(2026, 10, 16)],
  [THU, "next friday", on(2026, 10, 23)],
  [THU, "thursday", on(2026, 10, 22)],
  [THU, "mon 14:00", on(2026, 10, 19, 14)],
  [THU, "next week", on(2026, 10, 19)],
  [THU, "next month", on(2026, 11, 1)],
  [THU, "next quarter", on(2027, 1, 1)],
  [THU, "end of day", on(2026, 10, 15, 17)],
  [THU, "end of week", on(2026, 10, 16, 17)],
  [THU, "end of month", on(2026, 10, 31, 17)],
  [THU, "dec 3", on(2026, 12, 3)],
  [THU, "dec 3 14:00", on(2026, 12, 3, 14)],
  [THU, "3 dec 2pm", on(2026, 12, 3, 14)],
  [THU, "December 3rd at 2:30pm", on(2026, 12, 3, 14, 30)],
  [THU, "oct 1", on(2027, 10, 1)],
  [THU, "9am", on(2026, 10, 16, 9)],
  [THU, "14:00", on(2026, 10, 15, 14)],
  [THU, "noon", on(2026, 10, 15, 12)],
  // An hour alone is the working day's: 8 to 12 the morning's, 1 to 7 the afternoon's.
  [THU, "tomorrow 3", on(2026, 10, 16, 15)],
  [THU, "at 5", on(2026, 10, 15, 17)],
  [THU, "tomorrow 7:30", on(2026, 10, 16, 19, 30)],
  [THU, "tomorrow 07:30", on(2026, 10, 16, 7, 30)],
  [THU, "tomorrow 3am", on(2026, 10, 16, 3)],
  [THU, "midnight", on(2026, 10, 16, 0)],
  [THU, "14.30", on(2026, 10, 15, 14, 30)],
  [THU, "today 3pm", on(2026, 10, 15, 15)],
  [THU, "this afternoon at 3", on(2026, 10, 15, 15)],
  [THU, "2 p.m. tomorrow", on(2026, 10, 16, 14)],
  [THU, "9am on monday", on(2026, 10, 19, 9)],
  [THU, "next sunday", on(2026, 10, 25)],
  // "this <weekday>" said on that weekday is today; on any other day, the coming one.
  [THU, "this thursday 3pm", on(2026, 10, 15, 15)],
  [THU, "this friday", on(2026, 10, 16)],
  [THU, "in 3 days at 9", on(2026, 10, 18, 9)],
  [THU, "the 3rd of December", on(2026, 12, 3)],
  [MONTH_END, "tomorrow", on(2026, 11, 1)],
  [MONTH_END, "next month", on(2026, 11, 1)],
  [MONTH_END, "in 3 days", on(2026, 11, 3, 22)],
  [MONTH_END, "next week", on(2026, 11, 2)],
  [MONTH_END, "monday", on(2026, 11, 2)],
  [MONTH_END, "end of week", on(2026, 11, 6, 17)],
  [YEAR_END, "tomorrow 9", on(2027, 1, 1, 9)],
  [YEAR_END, "next week", on(2027, 1, 4)],
  [YEAR_END, "next month", on(2027, 1, 1)],
  [YEAR_END, "next quarter", on(2027, 1, 1)],
  [YEAR_END, "jan 2", on(2027, 1, 2)],
  [YEAR_END, "dec 3", on(2027, 12, 3)],
  [YEAR_END, "end of week", on(2027, 1, 1, 17)],
  [YEAR_END, "end of day", on(2026, 12, 31, 17)],
  [YEAR_END, "in 2 weeks", on(2027, 1, 14, 15)],
]

describe("parseWhen reads a time the way it is said", () => {
  for (const [now, text, at] of TABLE) {
    it(`"${text}" at ${now.toDateString()} ${now.getHours()}:00`, () => {
      const r = parseWhen(text, now)
      expect(r).toEqual({ at, words: formatSendAt(at, now) })
    })
  }

  it("says the moment in the app's words, on the person's own clock", () => {
    // Intl puts a narrow space before AM on newer runtimes.
    const words = (text: string) => {
      const r = parseWhen(text, THU)
      return r && "words" in r ? r.words.replace(/\s/g, " ") : r
    }
    expect(words("tomorrow 9")).toBe("tomorrow at 9:00 AM")
    expect(words("dec 3 14:00")).toBe("3 Dec at 2:00 PM")
    setAccountClock("24")
    expect(words("tomorrow 9")).toBe("tomorrow at 09:00")
  })

  it("lands on a whole minute", () => {
    const now = new Date(2026, 9, 15, 10, 0, 37, 500)
    expect(parseWhen("in 20 minutes", now)).toMatchObject({ at: on(2026, 10, 15, 10, 20) })
  })
})

describe("parseWhen says why it can't use a time", () => {
  it("reads nothing in no words", () => {
    expect(parseWhen("", THU)).toBeNull()
    expect(parseWhen("   ", THU)).toBeNull()
  })

  it("asks for the month in words: 12/3 is 3 Dec to some and 12 Mar to others", () => {
    for (const text of ["12/3", "3/12 9am", "12-3", "12.3.2026"]) {
      expect(parseWhen(text, THU), text).toEqual({ problem: "Write the month as a word, like Dec 3." })
    }
  })

  it("says how to write one it can't read", () => {
    // A day that lands at its own time takes none: "end of day 9" is no moment.
    for (const text of ["banana", "tomorrow at 25:00", "in many days", "end of day 9", "end of week at 3"]) {
      expect(parseWhen(text, THU), text).toEqual({ problem: "Try words like tomorrow 9, in 2 hours or Dec 3 14:00." })
    }
  })

  it("says a day that isn't in its month", () => {
    expect(parseWhen("feb 30", THU)).toEqual({ problem: "That day isn't in its month." })
  })

  it("keeps to the window: now to a year on, or the caller's own", () => {
    expect(parseWhen("dec 3 2025", THU)).toEqual({ problem: "That time has passed." })
    expect(parseWhen("end of month", MONTH_END)).toEqual({ problem: "That time has passed." })
    // "this thursday" on a Thursday is today, whose morning has gone by 10:00.
    expect(parseWhen("this thursday", THU)).toEqual({ problem: "That time has passed." })
    expect(parseWhen("in 2 years", THU)).toEqual({ problem: "Choose a time within the next year." })
    expect(parseWhen("in 2 weeks", THU, { max: on(2026, 10, 22, 10) })).toEqual({ problem: "Choose an earlier time." })
    expect(parseWhen("in 20 minutes", THU, { min: on(2026, 10, 15, 11) })).toEqual({ problem: "Choose a later time." })
    // Send later's window, in its own words (the server's 120 days).
    expect(parseWhen("in 5 months", THU, { problem: sendLaterProblem })).toEqual({ problem: "Pick a time within the next 120 days." })
    expect(parseWhen("in 2 weeks", THU, { problem: sendLaterProblem })).toMatchObject({ at: on(2026, 10, 29, 10) })
  })
})
