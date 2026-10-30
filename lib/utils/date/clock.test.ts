import { afterEach, describe, expect, it } from "vitest"
import { clockHour, clockRange, clockTime, readsTwelveHour, setAccountClock } from "./clock"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const us = { locale: "en-US" }
const gb = { locale: "en-GB" }
const india = { locale: "en-IN" }

describe("the one clock", () => {
  const nine = new Date(2026, 9, 12, 9, 15)
  const afternoon = new Date(2026, 9, 12, 15, 10)

  it("writes a time the way the reader's locale does", () => {
    expect(clockTime(nine, us)).toBe("9:15\u00a0AM")
    expect(clockTime(afternoon, us)).toBe("3:10\u00a0PM")
    expect(clockTime(nine, gb)).toBe("09:15")
    expect(clockTime(afternoon, gb)).toBe("15:10")
    expect(clockTime(afternoon, india)).toBe("3:10\u00a0pm")
    expect(clockTime(new Date(2026, 9, 12, 0, 30), us)).toBe("12:30\u00a0AM")
  })

  it("lets the person's own 12- or 24-hour choice win over the locale", () => {
    expect(clockTime(nine, { ...us, hour12: false })).toBe("09:15")
    expect(clockTime(afternoon, { ...gb, hour12: true })).toBe("3:10\u00a0pm")
    // Half past twelve is never "0:30 pm" (an 11-hour clock).
    expect(clockTime(new Date(2026, 9, 12, 12, 30), { ...gb, hour12: true })).toBe("12:30\u00a0pm")
    expect(readsTwelveHour({ ...gb, hour12: true })).toBe(true)
    expect(readsTwelveHour(us)).toBe(true)
    expect(readsTwelveHour(gb)).toBe(false)
  })

  it("reads a moment in a zone when asked", () => {
    const iso = "2026-10-12T04:00:00Z"
    expect(clockTime(iso, { ...us, timeZone: "Asia/Kolkata" })).toBe("9:30\u00a0AM")
    expect(clockTime(iso, { ...gb, timeZone: "UTC" })).toBe("04:00")
    // A zone the runtime doesn't know falls back to the device's clock.
    expect(clockTime(iso, { ...gb, timeZone: "Mars/Olympus" })).toMatch(/^\d{2}:\d{2}$/)
  })

  it("takes a Date, an ISO string or the API's seconds, and says nothing for a bad one", () => {
    const secs = Math.floor(nine.getTime() / 1000)
    expect(clockTime(secs, us)).toBe("9:15\u00a0AM")
    expect(clockTime(nine.getTime(), us)).toBe("9:15\u00a0AM")
    expect(clockTime(nine.toISOString(), us)).toBe("9:15\u00a0AM")
    expect(clockTime("not a date", us)).toBe("")
  })

  it("writes a wall-clock time as it is, in no zone", () => {
    expect(clockTime("17:00", us)).toBe("5:00\u00a0PM")
    expect(clockTime("09:30", { ...us, timeZone: "Asia/Kolkata" })).toBe("9:30\u00a0AM")
    expect(clockTime("9:05", gb)).toBe("09:05")
    expect(clockTime("25:00", us)).toBe("")
    expect(clockRange("09:00", "17:00", us)).toBe("9:00\u00a0AM – 5:00\u00a0PM")
  })

  it("keeps a time's words together, and lets a span wrap only at its dash", () => {
    // Home's greeting broke "In focus until 2:00 / PM" at 390.
    expect(clockTime(afternoon, us)).toBe("3:10\u00a0PM")
    expect(clockHour(nine, us)).toBe("9\u00a0AM")
    expect(clockRange(nine, afternoon, us)).toBe("9:15\u00a0AM – 3:10\u00a0PM")
    for (const s of [clockTime(afternoon, us), clockRange(nine, afternoon, us), clockHour(nine, us)]) {
      expect(s).not.toMatch(/[\u202f\u2009]/)
    }
  })

  it("has a bare form for the now pill, whose axis already says AM or PM", () => {
    expect(clockTime(new Date(2026, 9, 12, 10, 46), { ...us, bare: true })).toBe("10:46")
    expect(clockTime(new Date(2026, 9, 12, 22, 46), { ...gb, bare: true })).toBe("22:46")
  })

  it("has a compact form for the month grid: 9:30am and 2pm, or 14:00", () => {
    expect(clockTime(new Date(2026, 9, 12, 9, 30), { ...us, compact: true })).toBe("9:30am")
    expect(clockTime(new Date(2026, 9, 12, 14, 0), { ...us, compact: true })).toBe("2pm")
    expect(clockTime(new Date(2026, 9, 12, 14, 0), { ...gb, compact: true })).toBe("14:00")
    expect(clockTime(new Date(2026, 9, 12, 9, 5), { ...india, compact: true })).toBe("9:05am")
  })

  it("writes an hour on an axis as 9 AM, or 09:00 on a 24-hour clock", () => {
    expect(clockHour(new Date(2026, 9, 12, 9), us)).toBe("9\u00a0AM")
    expect(clockHour(new Date(2026, 9, 12, 13), us)).toBe("1\u00a0PM")
    expect(clockHour(new Date(2026, 9, 12, 9), gb)).toBe("09:00")
  })
})

describe("clockRange", () => {
  it("says the day period once when both ends share it", () => {
    expect(clockRange(new Date(2026, 9, 12, 10, 15), new Date(2026, 9, 12, 11, 15), us)).toBe("10:15 – 11:15\u00a0AM")
    expect(clockRange(new Date(2026, 9, 12, 15, 0), new Date(2026, 9, 12, 16, 0), us)).toBe("3:00 – 4:00\u00a0PM")
  })
  it("says both when the span crosses noon", () => {
    expect(clockRange(new Date(2026, 9, 12, 11, 30), new Date(2026, 9, 12, 12, 30), us)).toBe("11:30\u00a0AM – 12:30\u00a0PM")
  })
  it("writes a 24-hour span as the locale does", () => {
    expect(clockRange(new Date(2026, 9, 12, 9, 30), new Date(2026, 9, 12, 10, 15), gb)).toBe("09:30–10:15")
  })
  it("names both ends of a span past midnight, never the dates", () => {
    expect(clockRange(new Date(2026, 9, 12, 23, 0), new Date(2026, 9, 13, 0, 0), us)).toBe("11:00\u00a0PM – 12:00\u00a0AM")
  })
  // PTC-9: a day-long event from another zone read "09:30 – 09:30".
  it("names each end's day for a span of a day or more", () => {
    expect(clockRange(new Date(2026, 9, 15, 9, 30), new Date(2026, 9, 16, 9, 30), gb)).toBe("Thu\u00a009:30 – Fri\u00a009:30")
    expect(clockRange(new Date(2026, 9, 12, 23, 0), new Date(2026, 9, 13, 1, 0), gb)).toBe("23:00 – 01:00")
  })
  // From the review (rvClockDst): the rule measured a day as 24 hours, so a day
  // the clocks go forward on (23 hours) read "09:30 – 09:30" again. A day is
  // a day on the wall clock where the span is read.
  it("names each end's day on a day the clocks change, as on any other", () => {
    const london = { timeZone: "Europe/London", locale: "en-GB", hour12: false }
    expect(clockRange(new Date("2026-10-15T08:30:00Z"), new Date("2026-10-16T08:30:00Z"), london)).toBe("Thu\u00a009:30 – Fri\u00a009:30")
    // 09:30 GMT on Sat 28 March to 09:30 BST on Sun 29 March: 23 hours.
    expect(clockRange(new Date("2026-03-28T09:30:00Z"), new Date("2026-03-29T08:30:00Z"), london)).toBe("Sat\u00a009:30 – Sun\u00a009:30")
    // 09:30 BST on Sat 24 October to 09:30 GMT on Sun 25 October: 25 hours.
    expect(clockRange(new Date("2026-10-24T08:30:00Z"), new Date("2026-10-25T09:30:00Z"), london)).toBe("Sat\u00a009:30 – Sun\u00a009:30")
    // 24 hours by the watch, 23 on the wall: it ends before the hour it began at, and says so.
    expect(clockRange(new Date("2026-10-24T09:30:00Z"), new Date("2026-10-25T09:30:00Z"), london)).toBe("10:30 – 09:30")
  })
})

// Calendar A3b: the clock the person keeps on their account, on every device.
describe("the account's clock", () => {
  const afternoon = new Date(2026, 9, 12, 15, 10)
  afterEach(() => setAccountClock(undefined))

  it("writes every time in the kept clock, over the locale's", () => {
    setAccountClock("24")
    expect(clockTime(afternoon, us)).toBe("15:10")
    expect(readsTwelveHour(us)).toBe(false)
    setAccountClock("12")
    expect(clockTime(afternoon, gb)).toBe("3:10\u00a0pm")
    expect(readsTwelveHour(gb)).toBe(true)
  })

  it("leaves Automatic, or nothing kept, to the locale, and an explicit choice still wins", () => {
    setAccountClock("auto")
    expect(clockTime(afternoon, us)).toBe("3:10\u00a0PM")
    expect(clockTime(afternoon, gb)).toBe("15:10")
    setAccountClock("24")
    expect(clockTime(afternoon, { ...gb, hour12: true })).toBe("3:10\u00a0pm")
  })
})
