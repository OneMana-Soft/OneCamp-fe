import "./timelineTestKit"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ProjectTimeline } from "@/components/project/timeline/ProjectTimeline"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock } from "@/lib/testing/testClock"

// Audit A2-2: in a project where members change only their own tasks
// (edit_tasks "assigned"), the timeline offers a member only their own to
// move. It offered every bar, resize handle and Unscheduled row on the
// project's can_edit, which is true for any member, and the server refused
// the rest: each came back as "The dates weren't changed".

pinTestClock()

const ME = "u-me"
vi.mock("@/hooks/useMyId", () => ({ useMyId: () => ME }))

const MEMBER = { role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "assigned", delete_tasks: "assigned", log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false }
const reschedule = vi.fn(() => Promise.resolve())
const at = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = [
  { task_uuid: "mine", task_name: "Write the copy", task_status: "todo", task_start_date: at(5), task_due_date: at(8), task_assignee: { user_uuid: ME } },
  { task_uuid: "theirs", task_name: "Build the pages", task_status: "todo", task_start_date: at(9), task_due_date: at(12), task_assignee: { user_uuid: "u-ben" } },
  { task_uuid: "loose", task_name: "Pick the hosting", task_status: "todo", task_assignee: { user_uuid: "u-ben" } },
]
vi.mock("@/hooks/useProjectTimeline", () => ({
  useProjectTimeline: () => ({
    data: { tasks, total: tasks.length, can_edit: true, project_access: MEMBER },
    tasks,
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(),
    reschedule,
  }),
}))

beforeEach(() => {
  installPointerEvent()
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 2000, bottom: 1000, width: 2000, height: 1000, toJSON: () => ({}) } as DOMRect)
  if (typeof CSS === "undefined") vi.stubGlobal("CSS", { escape: (s: string) => s })
})
afterEach(() => {
  cleanup()
  reschedule.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const bar = (id: string) => document.querySelector<HTMLElement>(`[data-bar="${id}"]`)!
/** Holds a bar with the mouse, carries it three days later (a week's zoom: 16 px a day) and drops it. */
function carry(id: string) {
  fireEvent.pointerDown(bar(id), { button: 0, pointerType: "mouse", clientX: 400, clientY: 50 })
  fireEvent.pointerMove(window, { clientX: 448, clientY: 50 })
  fireEvent.pointerUp(window, { clientX: 448, clientY: 50 })
}

describe("a timeline where members change only their own tasks", () => {
  it("moves the member's own bar, and not another's", async () => {
    render(<ProjectTimeline projectId="p" onOpenTask={() => {}} />)
    await act(async () => carry("theirs"))
    expect(reschedule).not.toHaveBeenCalled()
    await act(async () => carry("mine"))
    expect(reschedule).toHaveBeenCalledTimes(1)
    expect((reschedule.mock.calls[0] as unknown[])[0]).toMatchObject({ task_uuid: "mine" })
  })

  it("nudges only the member's own bar from the keyboard, and tells them how only there", async () => {
    render(<ProjectTimeline projectId="p" onOpenTask={() => {}} />)
    expect(bar("theirs").hasAttribute("aria-describedby")).toBe(false)
    expect(bar("mine").hasAttribute("aria-describedby")).toBe(true)
    await act(async () => fireEvent.keyDown(bar("theirs"), { key: "ArrowRight" }))
    expect(reschedule).not.toHaveBeenCalled()
    await act(async () => fireEvent.keyDown(bar("mine"), { key: "ArrowRight" }))
    expect(reschedule).toHaveBeenCalledTimes(1)
  })

  it("lifts no one else's task from Unscheduled", () => {
    const open = vi.fn()
    render(<ProjectTimeline projectId="p" onOpenTask={open} />)
    fireEvent.click(screen.getByRole("button", { name: /^Unscheduled/ }))
    const row = screen.getByRole("button", { name: /Pick the hosting/ })
    expect(row.hasAttribute("aria-roledescription")).toBe(false)
    expect(screen.queryByText("Drag a task onto a day to make it due then.")).toBeNull()
    // Space lifts a task that can move; this one it opens.
    fireEvent.keyDown(row, { code: "Space", key: " " })
    expect(open).toHaveBeenCalledWith("loose")
  })
})
