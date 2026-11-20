import { describe, expect, it } from "vitest"
import { WORKING_WEEK, asBookingHours, copiedToWorkdays, weekOrder, weekProblem, withDay, withNewSpan, withSpan, withoutSpan } from "./workingHours"
import { MAX_DATES, datesGoneBy, datesProblem, goneBySentence, pageWeek, withPageWeek } from "./pageHours"
import { pinTestClock } from "@/lib/testing/testClock"

// A page's dates gone by are read against a clock: the tests' own.
pinTestClock()

// A person's working hours (calendar A3), checked as the server checks them.
describe("working hours", () => {
  it("starts at Monday to Friday, nine to five, and passes", () => {
    expect(Object.keys(WORKING_WEEK)).toEqual(["1", "2", "3", "4", "5"])
    expect(weekProblem(WORKING_WEEK)).toBeNull()
  })

  it("says what can't be kept, in the settings' words", () => {
    expect(weekProblem({})).toBe("Pick at least one day.")
    expect(weekProblem({ "1": [{ start: "10:00", end: "09:00" }] })).toBe("Each range has to end after it starts.")
    expect(weekProblem({ "1": [{ start: "13:00", end: "15:00" }, { start: "09:00", end: "13:30" }] })).toBe("A day's ranges can't overlap.")
    expect(weekProblem({ "1": [{ start: "", end: "09:00" }] })).toBe("Pick a start and an end.")
  })

  it("turns a day on with the day before's ranges, and off", () => {
    const split = withSpan(withNewSpan(WORKING_WEEK, 1), 1, 0, { start: "09:00", end: "12:30" })
    expect(split["1"]).toEqual([{ start: "09:00", end: "12:30" }, { start: "18:00", end: "19:00" }])
    const sat = withDay(split, 6, true)
    expect(sat["6"]).toEqual([{ start: "09:00", end: "17:00" }])
    expect(withDay(sat, 6, false)["6"]).toBeUndefined()
  })

  it("takes a range away, a day with none left off", () => {
    expect(withoutSpan(WORKING_WEEK, 1, 0)["1"]).toBeUndefined()
  })

  it("copies a day's ranges to every working day, leaving days off off", () => {
    const week = copiedToWorkdays(withSpan(WORKING_WEEK, 1, 0, { start: "08:00", end: "16:00" }), 1)
    expect(week["5"]).toEqual([{ start: "08:00", end: "16:00" }])
    expect(week["0"]).toBeUndefined()
  })

  it("orders the week from the day it starts on", () => {
    expect(weekOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(weekOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("gives a booking page the kept days, from the first start to the last end", () => {
    const week = { "1": [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:30" }], "3": [{ start: "08:30", end: "15:00" }], "5": [] }
    expect(asBookingHours(week, "Asia/Kolkata")).toEqual({ days: [1, 3], start: "08:30", end: "17:30", tz: "Asia/Kolkata" })
    expect(asBookingHours(week, null)).toBeNull()
    expect(asBookingHours(null, "UTC")).toBeNull()
    expect(asBookingHours({ "2": [] }, "UTC")).toBeNull()
  })
})

// gcal-7: a booking page's own week and its own dates (the server's
// weekHours.Hours week and dates), checked as the server checks them.
describe("a booking page's week and dates", () => {
  it("reads the page's week, or builds it from its days and one range", () => {
    expect(pageWeek({ days: [1, 3], start: "10:00", end: "12:00", tz: "UTC" })).toEqual({ "1": [{ start: "10:00", end: "12:00" }], "3": [{ start: "10:00", end: "12:00" }] })
    const week = { "2": [{ start: "09:00", end: "11:00" }, { start: "14:00", end: "18:00" }] }
    expect(pageWeek({ days: [2], start: "09:00", end: "18:00", tz: "UTC", week })).toBe(week)
  })

  it("keeps the days and the one range in step with the week it takes", () => {
    const week = { "4": [{ start: "13:00", end: "15:00" }], "1": [{ start: "08:00", end: "10:00" }] }
    expect(withPageWeek({ days: [5], start: "09:00", end: "17:00", tz: "Asia/Kolkata" }, week)).toEqual({ days: [1, 4], start: "08:00", end: "15:00", tz: "Asia/Kolkata", week })
    expect(withPageWeek({ days: [5], start: "09:00", end: "17:00", tz: "UTC" }, {}).days).toEqual([])
  })

  it("takes off the dates gone by in the page's zone, today's stays", () => {
    // 20:00 UTC on 17 Nov is already 18 Nov in Kolkata: the 17th has gone by there, not in New York.
    const now = new Date("2026-11-17T20:00:00Z")
    const dates = { "2026-11-16": [], "2026-11-17": [{ start: "10:00", end: "12:00" }], "2026-11-18": [] }
    expect(datesGoneBy(dates, "America/New_York", now)).toEqual({ dates: { "2026-11-17": [{ start: "10:00", end: "12:00" }], "2026-11-18": [] }, gone: ["2026-11-16"] })
    expect(datesGoneBy(dates, "Asia/Kolkata", now)).toEqual({ dates: { "2026-11-18": [] }, gone: ["2026-11-16", "2026-11-17"] })
    expect(datesGoneBy(undefined, "UTC", now)).toEqual({ dates: undefined, gone: [] })
  })

  it("says what it took off in one plain sentence", () => {
    expect(goneBySentence(["2026-11-03"])).toBe("We took off 3 Nov: it has gone by.")
    expect(goneBySentence(["2026-11-03", "2026-11-04"])).toBe("We took off 3 Nov and 4 Nov: they have gone by.")
    expect(goneBySentence([])).toBeNull()
  })

  it("passes days off, and says what's wrong with a date's ranges in the week's words", () => {
    expect(datesProblem({ "2026-12-25": [] })).toBeNull()
    expect(datesProblem(undefined)).toBeNull()
    expect(datesProblem({ "2026-12-24": [{ start: "12:00", end: "10:00" }] })).toBe(weekProblem({ "1": [{ start: "12:00", end: "10:00" }] }))
    expect(datesProblem({ "2026-12-24": [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] })).toBe("A day's ranges can't overlap.")
    const many = Object.fromEntries(Array.from({ length: MAX_DATES + 1 }, (_, i) => [`2027-01-${String(i + 1).padStart(2, "0")}`, []]))
    expect(MAX_DATES).toBe(60)
    expect(datesProblem(many)).toBe("Up to 60 dates.")
  })
})
