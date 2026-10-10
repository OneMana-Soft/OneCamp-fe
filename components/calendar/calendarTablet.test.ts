import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// On a tablet the calendar's area is about 560px wide (768 portrait) or 600px
// beside the mini month (1024 landscape). The month grid was pinned to 800px
// from 640px up, so Friday and Saturday sat behind the right edge, and the
// header kept its actions' width and squeezed the date controls over the title.

const src = readFileSync("components/calendar/calendarApp.tsx", "utf8")

describe("the calendar on a tablet", () => {
  it("lets the month grid fit the width it has", () => {
    const grid = src.match(/<div className="(min-w-0[^"]*flex flex-col h-full)">/)?.[1] ?? ""
    expect(grid, "the month grid's wrapper").not.toBe("")
    expect(grid).not.toMatch(/(?:sm|md|lg):min-w-\[\d+px\]/)
  })

  it("wraps its header's actions to a second line rather than squeezing the dates", () => {
    expect(src).toMatch(/<header className="relative flex flex-col sm:flex-row sm:flex-wrap /)
  })
})
