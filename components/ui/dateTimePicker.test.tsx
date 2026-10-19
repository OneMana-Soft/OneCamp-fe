import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DateTimePicker, QUARTER_HOURS, TimeList } from "./date-time-picker"

afterEach(cleanup)

// content.md C16: one picker for a moment, a day-cell month over a list of
// quarter hours, the chosen one an ink fill.
describe("the date and time picker", () => {
  it("offers every quarter hour, the chosen one selected", () => {
    expect(QUARTER_HOURS).toHaveLength(96)
    render(<TimeList value={9 * 60 + 30} onPick={vi.fn()} />)
    const chosen = screen.getAllByRole("option").filter((o) => o.getAttribute("aria-selected") === "true")
    expect(chosen).toHaveLength(1)
    expect(chosen[0].textContent).toMatch(/9:30/)
    // The interaction layer's selected row and a weight, not an ink slab
    // (SHADCN-AUDIT, 17 Oct; timeListSelected.test).
    expect(chosen[0].className).toContain("font-medium")
    expect(chosen[0].className).not.toMatch(/bg-ink/)
  })

  it("shows how long an end time makes the event", () => {
    render(<TimeList value={null} since={9 * 60} onPick={vi.fn()} />)
    const first = screen.getAllByRole("option")[0]
    expect(first.textContent).toMatch(/9:15.*15 min/)
  })

  it("writes the moment on its trigger, and sets the time from the list", () => {
    const onChange = vi.fn()
    render(<DateTimePicker value={new Date(2026, 9, 15, 9, 30)} onChange={onChange} aria-label="Start" />)
    const trigger = screen.getByLabelText("Start")
    expect(trigger.textContent).toBe("Thu 15 Oct · 9:30\u00a0AM")
    fireEvent.click(trigger)
    fireEvent.click(screen.getAllByRole("option").find((o) => /^10:00/.test(o.textContent || ""))!)
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 15, 10, 0))
  })
})
