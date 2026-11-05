import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { TaskListTask } from "@/components/task/taskListTask"

afterEach(cleanup)

const task = (over: Partial<TaskInfoInterface> = {}) =>
  ({
    task_uuid: "t-1",
    task_name: "Book the launch retro",
    task_status: "todo",
    task_priority: "",
    task_label: "",
    task_due_date: "",
    task_comment_count: 0,
    task_sub_task_count: 0,
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
    ...over,
  }) as unknown as TaskInfoInterface

// linear-03 (DESIGN-BUILD-107, V-459): a project without keys still has types,
// so the phone row shows a typed task's glyph where a key would sit.
describe("the phone row's type", () => {
  it("shows a typed task's glyph in a project without keys", async () => {
    render(<TaskListTask taskInfo={task({ task_work_type: { id: "b", builtin: "bug", name: "Bug", icon: "bug" } })} onToggleStatus={vi.fn()} isAdmin isAnimating={false} />)
    expect(await screen.findByRole("img", { name: "Bug" }, { timeout: 5000 })).toBeTruthy()
  })

  it("draws no key line for a plain task without a key", () => {
    const { container } = render(<TaskListTask taskInfo={task()} onToggleStatus={vi.fn()} isAdmin isAnimating={false} />)
    expect(container.querySelector("[data-task-key]")).toBeNull()
  })
})
