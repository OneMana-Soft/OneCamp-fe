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
    expect(block.getAttribute("data-hue")).toBe("sun")
    expect(block.className).toMatch(/hue-sun/)
    expect(block.className).toMatch(/text-hue-ink/)
    expect(block.querySelector("[data-hue-bar]")?.className).toMatch(/w-\[3px\].*bg-hue/)
  })

  // A selected one is ringed by its data-selected, the prop's or the open card's mark (C3).
  it("quietens a past event, fills a live one and rings a selected one", () => {
    expect(hueBlockClasses({ event_uuid: "e" }, { past: true })).toMatch(/\[--fill:33%\].*text-ink-2/)
    expect(hueBlockClasses({ event_uuid: "e" }, { live: true })).toMatch(/\[--fill:100%\]/)
    expect(hueBlockClasses({ event_uuid: "e" })).toMatch(/data-\[selected\]:ring-\[1\.5px\] data-\[selected\]:ring-hue/)
    render(<HueBlock item={{ event_uuid: "e" }} variant="block" selected>Picked</HueBlock>)
    expect(screen.getByRole("button", { name: "Picked" }).getAttribute("data-selected")).toBe("true")
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

  // B1, task blocks: time for a task is an event with a bar, in its task's
  // project's hue, led by the task's glyph, so it says where the task stands.
  it("draws time for a task with the task's glyph, a bar, and its project's hue", () => {
    const item = { event_uuid: "b1", event_task: { task_status: "done", project_uuid: "p1" } }
    render(
      <HueBlock item={item} variant="block">
        Write the brief
      </HueBlock>,
    )
    const block = screen.getByRole("button", { name: "Write the brief" })
    expect(block.getAttribute("data-hue-block")).toBe("block")
    expect(block.querySelector("[data-status-glyph]")?.getAttribute("data-status-glyph")).toBe("done")
    expect(block.querySelector("[data-hue-bar]")).toBeTruthy()
    const task = render(<HueBlock item={{ event_uuid: "t", isTask: true, task_project: { project_uuid: "p1" } }} variant="chip">Ship</HueBlock>)
    expect(block.getAttribute("data-hue")).toBe(task.getByRole("button", { name: "Ship" }).getAttribute("data-hue"))
  })

  // The glyph sits on the block's tint, where its hue's strong cut fell short
  // of a mark's 3:1: an in-progress sun read 2.44:1 on a lake block.
  it("draws a task's status in its hue's ink, on the block's tint", () => {
    render(<HueBlock item={{ event_uuid: "t", isTask: true, task_status: "in_progress" }} variant="block">Ship</HueBlock>)
    const glyph = screen.getByRole("button", { name: "Ship" }).querySelector("[data-status-glyph]")
    expect(glyph?.getAttribute("data-status-glyph")).toBe("progress")
    expect(glyph?.innerHTML).toMatch(/fill="var\(--camp-sun-ink\)"/)
  })

  // The calendar finds the event under the pointer or the focus by it: E, Delete and its menu.
  it("carries its item's id", () => {
    render(<HueBlock item={{ event_uuid: "e7" }} variant="row">Review</HueBlock>)
    expect(screen.getByRole("button", { name: "Review" }).getAttribute("data-event-uuid")).toBe("e7")
  })
})
