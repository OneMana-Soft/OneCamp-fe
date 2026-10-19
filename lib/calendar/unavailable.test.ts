import { describe, expect, it } from "vitest"
import { calendarAwayDetail } from "./unavailable"

const answered = (status: number, data: Record<string, unknown>) => ({ response: { status, data } })

describe("a calendar that can't answer for now", () => {
  it("says the server's words in place of the guess about the connection", () => {
    const moving = "The calendar is being moved to its new store. Try again in a minute."
    expect(calendarAwayDetail(answered(503, { msg: moving, code: "calendar_moving" }))).toBe(moving)
    const off = "This part of the calendar isn't switched on on this server yet."
    expect(calendarAwayDetail(answered(503, { msg: off, code: "calendar_off" }))).toBe(off)
  })
  it("leaves every other failure to the view's own words", () => {
    expect(calendarAwayDetail(answered(503, { msg: "The server hit a problem." }))).toBeUndefined()
    expect(calendarAwayDetail(answered(500, { code: "other" }))).toBeUndefined()
    expect(calendarAwayDetail(new Error("Network Error"))).toBeUndefined()
    expect(calendarAwayDetail(undefined)).toBeUndefined()
  })
})
