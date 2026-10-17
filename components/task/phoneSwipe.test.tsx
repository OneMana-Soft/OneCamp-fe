import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { TaskListTask } from "@/components/task/taskListTask"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

afterEach(cleanup)

installPointerEvent()

const task = { task_uuid: "t-1", task_name: "Book the launch retro", task_status: "todo", task_priority: "", task_label: "", task_due_date: "", task_comment_count: 0, task_sub_task_count: 0, task_project: { project_uuid: "p-1", project_name: "Q4 launch" } } as unknown as TaskInfoInterface

function swipe(el: Element, dx: number) {
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 100, clientY: 20 })
  fireEvent.pointerMove(el, { pointerType: "touch", clientX: 100 + dx / 2, clientY: 20 })
  fireEvent.pointerMove(el, { pointerType: "touch", clientX: 100 + dx, clientY: 20 })
  fireEvent.pointerUp(el, { pointerType: "touch", clientX: 100 + dx, clientY: 20 })
}

/** Swipes on the phone row (work.md W53). */
describe("the phone row's swipes", () => {
  it("completes once past the threshold", () => {
    const onToggle = vi.fn()
    const { container } = render(<TaskListTask taskInfo={task} onToggleStatus={onToggle} isAdmin isAnimating={false} />)
    swipe(container.querySelector("[data-swipe-row]")!, 90)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith("t-1", "p-1", "done")
  })

  it("springs back below it, completing nothing", () => {
    const onToggle = vi.fn()
    const { container } = render(<TaskListTask taskInfo={task} onToggleStatus={onToggle} isAdmin isAnimating={false} />)
    swipe(container.querySelector("[data-swipe-row]")!, 50)
    expect(onToggle).not.toHaveBeenCalled()
    expect((container.querySelector("[data-swipe-row]") as HTMLElement).style.transform).toBe("translateX(0px)")
  })

  it("reveals Due and More to the left", () => {
    const { container, getByText } = render(<TaskListTask taskInfo={task} onToggleStatus={vi.fn()} isAdmin isAnimating={false} />)
    swipe(container.querySelector("[data-swipe-row]")!, -120)
    expect(container.querySelector("[data-swipe-actions]")!.getAttribute("aria-hidden")).toBe("false")
    expect(getByText("Due")).toBeInTheDocument()
    expect(getByText("More")).toBeInTheDocument()
  })
})
