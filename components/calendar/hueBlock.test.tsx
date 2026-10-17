import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { HueBlock, hueBlockClasses } from "./HueBlock"

afterEach(cleanup)

// content.md C10: an event is its calendar's hue, a bar and a tint; focus
// time is never a hue; away is a dashed outline on nothing.
describe("an event drawn on time", () => {
  it("is a 3px bar of its hue over the tint, in the hue's ink", () => {
    render(<HueBlock item={{ event_uuid: "e1" }} variant="block">Standup</HueBlock>)
    const block = screen.getByRole("button", { name: "Standup" })
    expect(block.getAttribute("data-hue")).toBe("sky")
    expect(block.className).toMatch(/hue-sky/)
    expect(block.className).toMatch(/text-hue-ink/)
    expect(block.querySelector("[data-hue-bar]")?.className).toMatch(/w-\[3px\].*bg-hue/)
  })

  it("quietens a past event, fills a live one and rings a selected one", () => {
    expect(hueBlockClasses({ event_uuid: "e" }, { past: true })).toMatch(/\[--fill:33%\].*text-ink-2/)
    expect(hueBlockClasses({ event_uuid: "e" }, { live: true })).toMatch(/\[--fill:100%\]/)
    expect(hueBlockClasses({ event_uuid: "e" }, { selected: true })).toMatch(/ring-\[1\.5px\] ring-hue/)
  })

  it("draws focus time with no hue: hatched, an ink-3 bar and a moon", () => {
    render(<HueBlock item={{ event_uuid: "f", event_is_focus: true }} variant="block">Focus</HueBlock>)
    const block = screen.getByRole("button", { name: "Focus" })
    expect(block.getAttribute("data-hue")).toBeNull()
    expect(block.className).not.toMatch(/hue-/)
    expect(block.className).toMatch(/focus-hatch/)
    expect(block.querySelector("[data-hue-bar]")?.className).toMatch(/bg-ink-3/)
    expect(block.querySelector("svg.lucide-moon")).toBeTruthy()
  })

  it("draws time off as a dashed outline with a plane, and no bar", () => {
    render(<HueBlock item={{ event_uuid: "a", event_is_away: true }} variant="chip">Away</HueBlock>)
    const block = screen.getByRole("button", { name: "Away" })
    expect(block.className).toMatch(/border-dashed/)
    expect(block.querySelector("[data-hue-bar]")).toBeNull()
    expect(block.querySelector("svg.lucide-plane")).toBeTruthy()
  })

  it("starts a task with its status glyph in its project's hue", () => {
    render(<HueBlock item={{ event_uuid: "t", isTask: true, task_project: { project_uuid: "p1" } }} variant="chip">Ship</HueBlock>)
    const block = screen.getByRole("button", { name: "Ship" })
    expect(block.getAttribute("data-hue-block")).toBe("task")
    expect(block.querySelector("svg")).toBeTruthy()
  })

  // The calendar finds the event under the pointer or the focus by it: E, Delete and its menu.
  it("carries its item's id", () => {
    render(<HueBlock item={{ event_uuid: "e7" }} variant="row">Review</HueBlock>)
    expect(screen.getByRole("button", { name: "Review" }).getAttribute("data-event-uuid")).toBe("e7")
  })
})
