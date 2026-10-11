import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// content.md C01, owner decision 5: the app has one sidebar. The calendar's
// own 256px column (mini month, search, calendars, booking) moved into the
// Calendars popover, or a rail the person pins at 1600px and up.
const src = readFileSync("components/calendar/calendarApp.tsx", "utf8")

describe("the calendar's one sidebar", () => {
  it("draws no second sidebar column", () => {
    expect(src).not.toMatch(/\bw-64\b/)
    expect(src).not.toMatch(/<aside className="hidden lg:flex/)
  })

  it("keeps the calendars behind one button, as a popover or a pinned rail", () => {
    expect(src).toMatch(/Calendars\n/)
    expect(src).toMatch(/w-\[300px\]/)
    expect(src).toMatch(/min-width: 1600px/)
  })
})
