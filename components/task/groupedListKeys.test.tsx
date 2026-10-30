import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(cleanup)

const t = (id: string, status: string, extra: Partial<TaskInfoInterface> = {}) =>
  ({ task_uuid: id, task_name: `Task ${id}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "", ...extra }) as TaskInfoInterface

const renderList = (tasks: TaskInfoInterface[]) =>
  render(
    <Provider store={configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })}>
      <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" />
    </Provider>,
  ).container

// STEP4 #8: a list row reads priority, status, key, title. Every key in a
// list takes the width of its longest, so the titles line up, and the list
// is the sequence the panel's previous and next walk.
describe("keys in a list", () => {
  it("come after the status and before the title, as wide as the list's longest key", () => {
    const list = renderList([t("1", "todo", { task_key: "Q4-1" }), t("2", "todo", { task_key: "Q4-128" }), t("3", "done", { task_key: "Q4-12" })])
    const root = list.querySelector<HTMLElement>("[data-grouped-list]")!
    expect(root.style.getPropertyValue("--key-w")).toBe("6ch")
    expect(root.hasAttribute("data-task-sequence")).toBe(true)
    const row = list.querySelector<HTMLElement>("[data-task-id='1']")!
    const key = row.querySelector<HTMLElement>("[data-task-key]")!
    expect(key.textContent).toBe("Q4-1")
    // The key comes before the title in the row.
    expect(row.textContent!.indexOf("Q4-1")).toBeLessThan(row.textContent!.indexOf("Task 1"))
    expect(list.querySelectorAll("[data-task-key]")).toHaveLength(3)
  })

  it("aren't drawn at all in a list where no task has one yet", () => {
    const list = renderList([t("1", "todo"), t("2", "todo")])
    expect(list.querySelector("[data-task-key]")).toBeNull()
    expect(list.querySelector<HTMLElement>("[data-grouped-list]")!.style.getPropertyValue("--key-w")).toBe("")
  })
})
