import { describe, expect, it } from "vitest"
import { clockHour, clockRange, clockTime, readsTwelveHour } from "./clock"

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
})
