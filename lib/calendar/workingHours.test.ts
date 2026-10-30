import { describe, expect, it } from "vitest"
import { WORKING_WEEK, asBookingHours, copiedToWorkdays, weekOrder, weekProblem, withDay, withNewSpan, withSpan, withoutSpan } from "./workingHours"

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
