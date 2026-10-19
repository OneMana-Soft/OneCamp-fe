import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { TimeList } from "@/components/ui/date-time-picker"

// SHADCN-AUDIT (17 Oct 2026, sa1 after-time-open-1280-dark): the chosen time
// was painted `bg-ink text-sheet`, an inverted slab that in dark mode is a
// light block across a dark list. Each time is a row of the interaction layer,
// whose selected row (its tint and its leading bar) comes from tokens in both
// themes; the paint over it is gone, and the chosen time's weight is its cue
// that isn't colour.

afterEach(cleanup)

const INVERTED = /(^|\s)(bg-ink|text-sheet)(\/\d+)?(\s|$)/

describe("the chosen time in the time list", () => {
  it("is the interaction layer's selected row, not an ink slab", () => {
    render(<TimeList value={9 * 60} onPick={vi.fn()} />)
    const chosen = screen.getByRole("option", { selected: true })
    expect(chosen.textContent).toMatch(/9:00|09:00/)
    expect(chosen.getAttribute("data-interactive")).toBe("row")
    expect(chosen.className).not.toMatch(INVERTED)
    expect(chosen.className).toContain("font-medium")
  })

  it("keeps its duration in the list's own quiet ink", () => {
    render(<TimeList value={9 * 60} since={8 * 60} onPick={vi.fn()} />)
    const chosen = screen.getByRole("option", { selected: true })
    for (const el of Array.from(chosen.querySelectorAll("span"))) expect(el.className).not.toMatch(INVERTED)
  })

  it("draws the other times plainly", () => {
    render(<TimeList value={9 * 60} onPick={vi.fn()} />)
    const other = screen.getAllByRole("option", { selected: false })[0]
    expect(other.className).not.toContain("font-medium")
  })
})
