import { describe, expect, it } from "vitest"
import { dayKey, formatDay, formatRange, formatTime, groupByDay, googleCalendarUrl, icsFor, slugify } from "./availability"

describe("availability helpers", () => {
  it("puts a slot on the viewer's day", () => {
    // 20:00 UTC Monday is Tuesday morning in Tokyo.
    expect(dayKey("2026-10-05T20:00:00Z", "UTC")).toBe("2026-10-05")
    expect(dayKey("2026-10-05T20:00:00Z", "Asia/Tokyo")).toBe("2026-10-06")
  })

  it("groups slots by day, in order", () => {
    const g = groupByDay(
      [
        { start: "2026-10-05T09:00:00Z", end: "2026-10-05T09:30:00Z" },
        { start: "2026-10-05T10:00:00Z", end: "2026-10-05T10:30:00Z" },
        { start: "2026-10-06T09:00:00Z", end: "2026-10-06T09:30:00Z" },
      ],
      "UTC",
    )
    expect(g.map((d) => [d.day, d.slots.length])).toEqual([["2026-10-05", 2], ["2026-10-06", 1]])
  })

  it("writes a calendar file and a Google link", () => {
    const ics = icsFor({ uid: "b1", title: "Intro; with Sam", start: "2026-10-06T04:30:00Z", end: "2026-10-06T05:00:00Z", description: "line1\nline2" })
    expect(ics).toContain("DTSTART:20261006T043000Z")
    expect(ics).toContain(String.raw`SUMMARY:Intro\; with Sam`)
    expect(ics).toContain(String.raw`DESCRIPTION:line1\nline2`)
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR")
    expect(googleCalendarUrl({ title: "Intro", start: "2026-10-06T04:30:00Z", end: "2026-10-06T05:00:00Z" })).toContain("dates=20261006T043000Z%2F20261006T050000Z")
  })

  it("makes an address the server keeps", () => {
    expect(slugify("  Akash's 30-min Chat! ")).toBe("akash-s-30-min-chat")
  })

  it("writes days and times as the rest of the app does, in the viewer's zone", () => {
    expect(formatDay("2026-10-12")).toBe("Mon 12 Oct")
    expect(formatTime("2026-10-14T05:30:00Z", "Asia/Kolkata")).toMatch(/^11:00\sAM$/)
    expect(formatRange("2026-10-14T05:30:00Z", "2026-10-14T06:00:00Z", "Asia/Kolkata")).toMatch(/^Wednesday 14 October, 11:00\sAM to 11:30\sAM$/)
    // No browser-locale order ("Oct 12"), and "to", not a dash.
    expect(formatRange("2026-10-14T05:30:00Z", "2026-10-14T06:00:00Z", "UTC")).not.toMatch(/[–—]|October 14/)
  })
})
