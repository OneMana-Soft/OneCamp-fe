import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { TaskInfoInterface } from "@/types/task"

const celebrate = vi.fn()
vi.mock("@/lib/celebrate", () => ({ celebrate: (el: Element) => celebrate(el) }))

import { TaskListTask } from "@/components/task/taskListTask"

afterEach(() => {
  cleanup()
  celebrate.mockClear()
})

/**
 * Completing a task is one of the few moments the playful layer celebrates: a
 * burst of camp-hued sparks from the check. Only on the click that completes
 * it; un-ticking a task, or a list of tasks already done, never celebrates.
 */
function task(status: "todo" | "done"): TaskInfoInterface {
  return {
    task_uuid: "t-1",
    task_name: "Post the load test numbers",
    task_status: status,
    task_priority: "medium",
    task_label: "",
    task_due_date: "0001-01-01T00:00:00Z",
    task_start_date: "0001-01-01T00:00:00Z",
    task_created_at: "2026-10-01T09:00:00Z",
    task_comment_count: 0,
    task_sub_task_count: 0,
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
  } as unknown as TaskInfoInterface
}

describe("completing a task", () => {
  it("bursts from the check that was clicked, and still completes it", () => {
    const onToggle = vi.fn()
    render(<TaskListTask taskInfo={task("todo")} onToggleStatus={onToggle} isAdmin isAnimating={false} />)
    const check = screen.getByRole("button", { name: "Mark as complete" })
    fireEvent.click(check)
    expect(celebrate).toHaveBeenCalledTimes(1)
    expect(celebrate).toHaveBeenCalledWith(check)
    expect(onToggle).toHaveBeenCalledWith("t-1", "p-1", "done")
  })

  it("does not celebrate taking a task back to do", () => {
    const onToggle = vi.fn()
    render(<TaskListTask taskInfo={task("done")} onToggleStatus={onToggle} isAdmin isAnimating={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark as incomplete" }))
    expect(celebrate).not.toHaveBeenCalled()
    expect(onToggle).toHaveBeenCalledWith("t-1", "p-1", "todo")
  })

  it("springs the check in only after a click completed it, never on load", () => {
    const { container, rerender } = render(<TaskListTask taskInfo={task("done")} onToggleStatus={() => {}} isAdmin isAnimating={false} />)
    expect(container.querySelector(".animate-spring")).toBeNull()
    rerender(<TaskListTask taskInfo={task("todo")} onToggleStatus={() => {}} isAdmin isAnimating={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark as complete" }))
    rerender(<TaskListTask taskInfo={task("done")} onToggleStatus={() => {}} isAdmin isAnimating={false} />)
    expect(container.querySelector(".animate-spring")).not.toBeNull()
  })
})
