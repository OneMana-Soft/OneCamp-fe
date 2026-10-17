import "./timelineTestKit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { pinTestClock } from "@/lib/testing/testClock"

// PB-42: a task with no dates goes onto a day by the shared drag (lib/ui/dnd):
// a mouse, a finger held a beat, or the keyboard. It used to be an HTML5 drag,
// which a keyboard could not start and a finger could not hold.

// The timeline opens on today, beside these dates.
pinTestClock()

const reschedule = vi.fn(() => Promise.resolve())
const at = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = [
  { task_uuid: "dated", task_name: "Plan the launch", task_status: "inProgress", task_start_date: at(5), task_due_date: at(12) },
  { task_uuid: "loose", task_name: "Write the announcement", task_status: "todo" },
]
vi.mock("@/hooks/useProjectTimeline", () => ({
  useProjectTimeline: () => ({
    data: { tasks, total: tasks.length, can_edit: true },
    tasks,
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(),
    reschedule,
  }),
}))

// jsdom lays nothing out: give every box room, so the held task meets the grid.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 2000, bottom: 1000, width: 2000, height: 1000, toJSON: () => ({}) } as DOMRect)
  // Radix and the grid read CSS.escape, which jsdom lacks.
  if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (s: string) => s })
})
afterEach(() => {
  cleanup()
  reschedule.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const row = () => screen.getByRole("button", { name: /Write the announcement/ })
const said = () => document.querySelector("[data-announce]")?.textContent ?? ""
// A key, then the beat the keyboard sensor and the live region take.
const key = async (code: string, k = code) => {
  fireEvent.keyDown(document.activeElement ?? document.body, { code, key: k })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80))
  })
}

describe("a task with no dates, from the keyboard", () => {
  it("is picked up with Space, moved a day with the arrows, and dropped with Space on that day", async () => {
    render(<ProjectTimeline projectId="p" onOpenTask={() => {}} />)
    row().focus()
    await key("Space", " ")
    expect(said()).toMatch(/^Picked up Write the announcement\. Unscheduled\.$/)
    expect(row().getAttribute("data-drag-state")).toBe("placeholder")

    await key("ArrowRight")
    const ghost = document.querySelector("[data-drop-ghost]")
    expect(ghost).not.toBeNull()
    const first = ghost!.textContent
    await key("ArrowRight")
    expect(document.querySelector("[data-drop-ghost]")!.textContent).not.toBe(first)
    // Each day is said as it is reached.
    expect(said()).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d+ \w+$/)

    await key("Space", " ")
    expect(reschedule).toHaveBeenCalledTimes(1)
    const [task, dates] = reschedule.mock.calls[0] as unknown as [{ task_uuid: string }, { task_due_date: string }]
    expect(task.task_uuid).toBe("loose")
    expect(dates.task_due_date).not.toBe("")
    expect(document.querySelector("[data-drop-ghost]")).toBeNull()
  })

  it("goes back where it was on Escape, and nothing is changed", async () => {
    render(<ProjectTimeline projectId="p" onOpenTask={() => {}} />)
    row().focus()
    await key("Space", " ")
    await key("ArrowRight")
    await key("Escape")
    expect(reschedule).not.toHaveBeenCalled()
    expect(document.querySelector("[data-drop-ghost]")).toBeNull()
    expect(row().hasAttribute("data-drag-state")).toBe(false)
  })

  it("opens on Enter, and says how to move it", async () => {
    const open = vi.fn()
    render(<ProjectTimeline projectId="p" onOpenTask={open} />)
    row().focus()
    await key("Enter", "Enter")
    expect(open).toHaveBeenCalledWith("loose")
    expect(row().getAttribute("aria-roledescription")).toBe("draggable task")
    const help = document.getElementById(row().getAttribute("aria-describedby") ?? "")
    expect(help?.textContent).toMatch(/press Space/)
  })
})
