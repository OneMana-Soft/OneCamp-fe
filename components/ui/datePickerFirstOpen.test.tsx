import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"

import { DateField } from "./date-field"

afterEach(cleanup)
pinTestClock()

// DESIGN-BUILD-21's M2: the popover opened on a stand-in (280px) while the
// picker's chunk loaded, and Radix, placing it by that size, kept the taller
// panel below its field, cut at the window's foot. A file of its own: its one
// open is the chunk's first load, which another test here would have done.
describe("a date field's first open, where overlays float", () => {
  it("opens its popover once the picker is in, never on a stand-in", async () => {
    render(<DateField aria-label="Due" value="2026-11-01" onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Due, Sun 1 Nov 2026" }))
    expect(document.querySelector('[data-overlay="float"]')).toBeNull()
    const grid = await screen.findByRole("grid", {}, { timeout: 8000 })
    expect(grid.closest('[data-overlay="float"]')).toBeTruthy()
  })
})
