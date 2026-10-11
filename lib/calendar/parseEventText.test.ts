import { describe, expect, it } from "vitest"

import { parseEventText, parsedRange } from "./parseEventText"

// Sunday 11 Oct 2026, 10:42.
const now = new Date(2026, 9, 11, 10, 42)

describe("reading a quick-create title", () => {
  it("reads lunch with Maya at 1pm tomorrow: the day, the time and the guest", () => {
    const p = parseEventText("Lunch with Maya at 1pm tomorrow", now)
    expect(p.title).toBe("Lunch with Maya")
    expect(p.date).toEqual(new Date(2026, 9, 12))
    expect(p.startMinutes).toBe(13 * 60)
    expect(p.people).toEqual(["Maya"])
  })

  it("reads a length and a weekday", () => {
    const p = parseEventText("Copy review with Maya Thu at 2pm for 45m", now)
    expect(p.title).toBe("Copy review with Maya")
    expect(p.date).toEqual(new Date(2026, 9, 15))
    expect(p.startMinutes).toBe(14 * 60)
    expect(p.durationMinutes).toBe(45)
  })

  it("reads 24-hour times, half past, hours and two guests", () => {
    const p = parseEventText("Planning 13:30 for 1.5 hours with Maya and Jonas", now)
    expect(p.startMinutes).toBe(13 * 60 + 30)
    expect(p.durationMinutes).toBe(90)
    expect(p.people).toEqual(["Maya", "Jonas"])
  })

  it("reads an afternoon from a bare 'at 3', and a date by month", () => {
    expect(parseEventText("Call at 3", now).startMinutes).toBe(15 * 60)
    expect(parseEventText("Offsite 20 Oct", now).date).toEqual(new Date(2026, 9, 20))
    expect(parseEventText("Offsite Jan 5", now).date).toEqual(new Date(2027, 0, 5))
  })

  it("marks focus time, and names an empty focus block", () => {
    const p = parseEventText("focus 9am for 2h", now)
    expect(p.focus).toBe(true)
    expect(p.durationMinutes).toBe(120)
    expect(parseEventText("focus", now).title).toBe("focus")
  })

  it("returns the spans it read, for underlining", () => {
    const text = "Lunch with Maya at 1pm tomorrow"
    const kinds = parseEventText(text, now).spans.map((s) => [s.kind, text.slice(s.start, s.end)])
    expect(kinds).toEqual([
      ["people", "Maya"],
      ["time", "at 1pm"],
      ["date", "tomorrow"],
    ])
  })

  it("turns a parse into a range, from defaults where it says nothing", () => {
    const fallback = new Date(2026, 9, 13, 9, 30)
    const r = parsedRange(parseEventText("Standup", now), fallback, 30)
    expect(r.start).toEqual(fallback)
    expect(r.end).toEqual(new Date(2026, 9, 13, 10, 0))
    const r2 = parsedRange(parseEventText("Lunch at 1pm tomorrow for 45m", now), fallback, 30)
    expect(r2.start).toEqual(new Date(2026, 9, 12, 13, 0))
    expect(r2.end).toEqual(new Date(2026, 9, 12, 13, 45))
  })
})
