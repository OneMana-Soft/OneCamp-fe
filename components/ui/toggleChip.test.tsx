import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ToggleChip } from "./toggleChip"

afterEach(cleanup)

// ST-36: the agent editor's pills inserted a check when chosen, so the chip
// widened and the row re-wrapped under the pointer.
describe("a toggle chip", () => {
  it("keeps its check's place on and off, so choosing it moves nothing", () => {
    const { rerender } = render(<ToggleChip pressed={false} onPressedChange={() => {}}>#launch</ToggleChip>)
    const chip = screen.getByRole("button", { name: "#launch" })
    // The one check (MenuCheck): off, its slot is there and empty, keeping its room.
    const slot = () => chip.querySelector<HTMLElement>("[data-menu-check]")!
    expect(slot().getAttribute("data-menu-check")).toBe("off")
    expect(slot().className).toContain("size-3")
    expect(slot().querySelector("svg")).toBeNull()
    rerender(<ToggleChip pressed onPressedChange={() => {}}>#launch</ToggleChip>)
    expect(slot().getAttribute("data-menu-check")).toBe("on")
    expect(slot().className).toContain("size-3")
    expect(slot().querySelectorAll("svg")).toHaveLength(1)
  })

  it("says it is on, is a chip of the interaction layer, and takes a finger's 44px", () => {
    const change = vi.fn()
    render(<ToggleChip pressed onPressedChange={change}>Create tasks</ToggleChip>)
    const chip = screen.getByRole("button", { name: "Create tasks" })
    expect(chip.getAttribute("aria-pressed")).toBe("true")
    expect(chip.getAttribute("data-interactive")).toBe("chip")
    expect(chip.hasAttribute("data-touch-target")).toBe(true)
    fireEvent.click(chip)
    expect(change).toHaveBeenCalledWith(false)
  })

  // Code review (22 Oct): the rules' PickChip was a second toggle chip. A pick
  // isn't an action, so its tone is neutral (an ink check on the press tint,
  // never the accent), and off it offers a quiet "+".
  it("can be a neutral pick, offering a + when off", () => {
    const { rerender } = render(<ToggleChip tone="neutral" offMark="plus" pressed={false} onPressedChange={() => {}}>Assignee</ToggleChip>)
    const chip = screen.getByRole("button", { name: "Assignee" })
    expect(chip.getAttribute("data-interactive")).toBe("toggle")
    expect(chip.getAttribute("data-tone")).toBe("neutral")
    expect(chip.querySelector("[data-chip-mark='plus']")).not.toBeNull()
    rerender(<ToggleChip tone="neutral" offMark="plus" pressed onPressedChange={() => {}}>Assignee</ToggleChip>)
    expect(chip.querySelector("[data-chip-mark='plus']")).toBeNull()
    expect(chip.querySelector("[data-menu-check='on']")!.className).toContain("text-ink")
    expect(chip.className).toContain("bg-press")
  })
})
