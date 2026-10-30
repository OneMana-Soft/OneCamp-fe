import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { pinTestClock } from "@/lib/testing/testClock"
import type { DependencyTask, TaskInfoInterface } from "@/types/task"

vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))
const setDependency = vi.fn(async () => true)
vi.mock("@/hooks/useTaskDependencies", () => ({ useTaskDependencies: () => setDependency }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: [] }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))

const { Item } = await import("@/components/kanbanComponents/Item/Item")
const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")
const { TaskDependencies } = await import("@/components/task/TaskDependencies")
const { HIDDEN_TASK_NAME, taskNameOf } = await import("@/lib/work/hiddenTask")

afterEach(cleanup)
pinTestClock()

const task = (over: Partial<TaskInfoInterface> = {}) =>
  ({
    task_uuid: "t-1",
    task_name: "Zephyr pay review",
    task_status: "todo",
    task_priority: "high",
    task_label: "",
    task_due_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_comment_count: 0,
    task_sub_task_count: 0,
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
    ...over,
  }) as unknown as TaskInfoInterface

const LOCK = "Only some people can see this task"
const store = () => configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
const card = (t: TaskInfoInterface) => render(<Provider store={store()}><Item task={t} value="t-1" /></Provider>)

// WA2b: a restricted task its reader may see carries a lock wherever it is
// listed, worded for a screen reader; an open task carries none. The lock
// is restriction's alone: waiting on open tasks has a glyph of its own.
describe("the lock on a restricted task", () => {
  it("sits on a board card's top line, beside the key", () => {
    const { container } = card(task({ task_key: "Q4-7", task_restricted: true }))
    const line = container.querySelector<HTMLElement>("[data-card-key]")!
    expect(within(line).getByTitle(LOCK)).toBeTruthy()
    expect(within(line).getByText(LOCK).className).toContain("sr-only")
  })

  it("shows on a card with no key, and on no open card", () => {
    const { container } = card(task({ task_restricted: true }))
    expect(container.querySelector("[data-card-key] [data-restricted-mark]")).toBeTruthy()
    cleanup()
    const open = card(task({ task_key: "Q4-8" }))
    expect(open.container.querySelector("[data-restricted-mark]")).toBeNull()
  })

  it("isn't the blocked badge's glyph", () => {
    const { container } = card(task({ task_key: "Q4-7", task_restricted: true, task_blocked_open: 2 }))
    const blocked = container.querySelector<HTMLElement>("[title='Blocked by 2 tasks']")!
    const lock = container.querySelector<HTMLElement>("[data-restricted-mark]")!
    expect(blocked.querySelector("svg")!.getAttribute("class")).not.toContain("lucide-lock")
    expect(lock.querySelector("svg")!.getAttribute("class")).toContain("lucide-lock")
  })

  it("follows the title on a list row", () => {
    const list = render(
      <Provider store={store()}>
        <GroupedTaskList
          tasks={[task({ task_uuid: "a", task_restricted: true }), task({ task_uuid: "b", task_name: "Launch post" })]}
          options={BUILT_IN_STATUSES}
          grouping="status"
          props={PROJECT_PROPS}
          canEdit={() => true}
          projectId="p-1"
        />
      </Provider>,
    ).container
    expect(list.querySelector("[data-task-id='a'] [data-restricted-mark]")).toBeTruthy()
    expect(list.querySelector("[data-task-id='b'] [data-restricted-mark]")).toBeNull()
  })
})

// A task the reader may not see is "A task you can't see" wherever a link to
// it stays: never its name (the server sends none), never a way into it.
describe("a task you can't see", () => {
  it("has words of its own", () => {
    expect(taskNameOf({ task_name: "", task_hidden: true })).toBe(HIDDEN_TASK_NAME)
    expect(HIDDEN_TASK_NAME).toBe("A task you can't see")
    expect(taskNameOf({ task_name: "Design" })).toBe("Design")
  })

  it("is a dependency that can't be opened or taken off, and isn't counted as open", () => {
    const hidden = { task_uuid: "zephyr", task_hidden: true, "task_blocked_by|kind": "fs" } as unknown as DependencyTask
    const design: DependencyTask = { task_uuid: "design", task_name: "Design", task_status: "todo" }
    const onOpen = vi.fn()
    render(<TaskDependencies taskUUID="build" taskName="Build" projectUUID="p" canEdit waitingOn={[hidden, design]} blocking={[]} onOpen={onOpen} />)
    const row = screen.getByText(HIDDEN_TASK_NAME).closest<HTMLElement>("[data-dependency]")!
    expect(row.hasAttribute("data-hidden-task")).toBe(true)
    expect(within(row).queryByRole("button")).toBeNull()
    expect(screen.getByText("Waiting on (1 still open)")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Stop waiting on A task you can't see/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Stop waiting on Design" })).toBeTruthy()
    fireEvent.click(screen.getByText("Design"))
    expect(onOpen).toHaveBeenCalledWith("design")
  })
})
