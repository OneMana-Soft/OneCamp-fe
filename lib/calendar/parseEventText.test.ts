import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { parseWhen } from "@/lib/time/whenWords"
import { parseEventText, parsedRange } from "./parseEventText"

// Sunday 11 Oct 2026, 10:42.
const now = new Date(2026, 9, 11, 10, 42)
// Thursday 15 Oct 2026, 10:00: the clock every test here runs on.
const THU = new Date(2026, 9, 15, 10, 0)
pinTestClock(THU)

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

// One meaning per phrase (CR-B9 M1): the calendar reads day and time words as
// Remind me does (lib/time/dayWords), on Thursday 15 Oct 2026, 10:00.

describe("reading day and time words as Remind me reads them", () => {
  it('reads "next friday" as next week\'s, and "this friday" said on a Friday as that day', () => {
    expect(parseEventText("Lunch next friday", THU).date).toEqual(new Date(2026, 9, 23))
    expect(parseEventText("Lunch friday", THU).date).toEqual(new Date(2026, 9, 16))
    const p = parseEventText("Review this friday", new Date(2026, 9, 16, 10, 0))
    expect(p.date).toEqual(new Date(2026, 9, 16))
    expect(p.title).toBe("Review")
  })

  it('reads "tonight" as 20:00, and an hour said tonight as the evening\'s', () => {
    expect(parseEventText("Drinks tonight", THU).startMinutes).toBe(20 * 60)
    expect(parseEventText("Drinks tonight at 9", THU).startMinutes).toBe(21 * 60)
    expect(parseEventText("Drinks tonight at 9am", THU).startMinutes).toBe(9 * 60)
  })

  it("reads an hour from 1 to 7 as the afternoon's however it is written, and a leading zero as written", () => {
    expect(parseEventText("Standup 7:30", THU).startMinutes).toBe(19 * 60 + 30)
    expect(parseEventText("Standup at 07:30", THU).startMinutes).toBe(7 * 60 + 30)
    expect(parseEventText("Standup 9:15", THU).startMinutes).toBe(9 * 60 + 15)
  })

  // A time box is a field for a clock time (CHAT-LEAD-34's ruling, 5 Nov): a
  // time typed there alone is read as a clock, "7:30" 07:30, as every time
  // field reads it. The afternoon rule is for a time said with a day.
  it("reads a time box's time alone as a clock, and one said with a day as words", () => {
    expect(parseEventText("7:30", THU, { clock: true }).startMinutes).toBe(7 * 60 + 30)
    expect(parseEventText("at 3", THU, { clock: true }).startMinutes).toBe(3 * 60)
    expect(parseEventText("7:30pm", THU, { clock: true }).startMinutes).toBe(19 * 60 + 30)
    expect(parseEventText("tomorrow 7:30", THU, { clock: true }).startMinutes).toBe(19 * 60 + 30)
    expect(parseEventText("friday at 3", THU, { clock: true }).startMinutes).toBe(15 * 60)
    // Quick create's words keep the afternoon rule.
    expect(parseEventText("7:30", THU).startMinutes).toBe(19 * 60 + 30)
  })

  it("leaves a day its month doesn't have in the title", () => {
    const p = parseEventText("Offsite Feb 30", THU)
    expect(p.date).toBeUndefined()
    expect(p.title).toBe("Offsite Feb 30")
  })

  it('reads "tmr" as tomorrow', () => {
    expect(parseEventText("Call tmr at 3", THU).date).toEqual(new Date(2026, 9, 16))
  })

  it("names the moment Remind me names, for the words both read", () => {
    for (const words of ["next friday 3pm", "tonight at 9", "tomorrow 7:30", "tomorrow at 07:30", "dec 3 14:00", "monday at noon", "tmrw at 9am", "this thursday 3pm", "oct 1 at 9"]) {
      const said = parseWhen(words, THU)
      const read = parseEventText(words, THU)
      expect(said && "at" in said ? said.at : said, words).toEqual(parsedRange(read, THU, 30).start)
    }
  })
})
