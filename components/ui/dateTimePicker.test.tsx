import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DateTimePicker, QUARTER_HOURS, TimeList } from "./date-time-picker"
import { TimePanel } from "./date-field-panels"
import { pinTestClock } from "@/lib/testing/testClock"

afterEach(cleanup)

// content.md C16: one picker for a moment, a day-cell month over a list of
// quarter hours, the chosen one an ink fill.
describe("the date and time picker", () => {
  pinTestClock(new Date(2026, 9, 15, 10, 0))

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
    // Its name says its value too (V-642 F2): an aria-label alone hid the time from a screen reader.
    const trigger = screen.getByRole("button", { name: /^Start, Thu 15 Oct, 9:30\sAM$/ })
    expect(trigger.textContent).toBe("Thu 15 Oct · 9:30\u00a0AM")
    fireEvent.click(trigger)
    expect(document.querySelector("[data-picker-clock]")).toBeNull()
    fireEvent.click(screen.getAllByRole("option").find((o) => /^10:00/.test(o.textContent || ""))!)
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 9, 15, 10, 0))
  })

  it("names its zone after the time, over its times and to a screen reader, when asked (V-642 F1, F2)", () => {
    render(<DateTimePicker value={new Date("2026-10-21T12:30:00Z")} onChange={vi.fn()} zone="America/New_York" named aria-label="Start" />)
    const trigger = screen.getByRole("button", { name: /^Start, Wed 21 Oct, 8:30\sAM Eastern Daylight Time$/ })
    expect(trigger.textContent).toMatch(/^Wed 21 Oct · 8:30\sAM EDT$/)
    fireEvent.click(trigger)
    expect(document.querySelector("[data-picker-clock]")?.textContent).toBe("Times in Eastern Daylight Time")
  })

  // A time box is a field for a clock time (CHAT-LEAD-34's ruling, 5 Nov):
  // "7:30" typed there is 07:30, as before and as every time field reads it.
  // The afternoon rule is for a time said with a day ("tomorrow 7:30").
  it("reads a time typed alone as a clock, and one said with a day as words", () => {
    const onChange = vi.fn()
    render(<DateTimePicker value={new Date(2026, 9, 15, 9, 30)} onChange={onChange} aria-label="Start" />)
    const type = (words: string) => {
      // The trigger's name carries its value since V-642 F2 ("Start, Thu 15 Oct, 9:30 AM").
      fireEvent.click(screen.getByRole("button", { name: /^Start, / }))
      const box = screen.getByLabelText("Type a date and time")
      fireEvent.change(box, { target: { value: words } })
      fireEvent.keyDown(box, { key: "Enter" })
    }
    type("7:30")
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 9, 15, 7, 30))
    type("tomorrow 7:30")
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 9, 16, 19, 30))
  })

  it("reads the time panel's typed time as a clock", () => {
    const onPick = vi.fn()
    render(<TimePanel minutes={null} onPick={onPick} />)
    const box = screen.getByLabelText("Type a time")
    fireEvent.change(box, { target: { value: "7:30" } })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onPick).toHaveBeenCalledWith(7 * 60 + 30)
  })
})
