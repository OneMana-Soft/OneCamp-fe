import { describe, expect, it } from "vitest"
import { dayKey, formatDay, formatRange, formatTime, groupByDay, googleCalendarUrl, icsFor, slugify } from "./availability"
import { pinTestClock } from "@/lib/testing/testClock"

// Its dates are written instants, never today's: the one pin keeps it so (app/testClock.test.ts).
pinTestClock()

describe("availability helpers", () => {
  it("puts a slot on the viewer's day", () => {
    // 20:00 UTC Monday is Tuesday morning in Tokyo.
    expect(dayKey("2026-10-05T20:00:00Z", "UTC")).toBe("2026-10-05")
    expect(dayKey("2026-10-05T20:00:00Z", "Asia/Tokyo")).toBe("2026-10-06")
  })

  it("reads a day the one way the clock does: a zone's own near midnight, a zone this runtime can't read on the device's (CR-B30 G1)", () => {
    // 23:50 on 5 Nov in New York is 10:20 on the 6th in Kolkata; 00:10 on the 6th in Kolkata is 13:40 on the 5th in New York.
    expect(dayKey("2026-11-06T04:50:00Z", "America/New_York")).toBe("2026-11-05")
    expect(dayKey("2026-11-06T04:50:00Z", "Asia/Kolkata")).toBe("2026-11-06")
    expect(dayKey(new Date("2026-11-05T18:40:00Z"), "Asia/Kolkata")).toBe("2026-11-06")
    expect(dayKey(new Date("2026-11-05T18:40:00Z"), "America/New_York")).toBe("2026-11-05")
    // A zone this runtime can't read is the device's own day, as clockTime and wallClock fall back, not a crash.
    for (const iso of ["2026-11-06T04:50:00Z", "2026-11-05T18:40:00Z"]) {
      const d = new Date(iso)
      const device = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      expect(dayKey(iso, "Not/AZone")).toBe(device)
    }
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
