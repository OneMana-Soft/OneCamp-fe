import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { groupTasks, headedRows, whenOf } from "@/lib/tasks/grouping"
import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(cleanup)

const t = (id: string, status: string, extra: Partial<TaskInfoInterface> = {}) =>
  ({ task_uuid: id, task_name: `Task ${id}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "", ...extra }) as TaskInfoInterface

describe("grouping", () => {
  it("orders status groups as the board's columns: backlog, to do, in progress, in review, done; cancelled left out (PTC-30)", () => {
    const groups = groupTasks([t("1", "todo"), t("2", "done"), t("3", "inProgress"), t("4", "backlog"), t("5", "inReview"), t("6", "canceled")], "status", BUILT_IN_STATUSES)
    expect(groups.map((g) => g.key)).toEqual(["backlog", "todo", "inProgress", "inReview", "done"])
    // One order: the board's columns are the project's statuses in this order.
    expect(BUILT_IN_STATUSES.filter((o) => o.value !== "canceled").map((o) => o.value)).toEqual(groups.map((g) => g.key))
  })

  it("groups My Tasks by when, with Overdue only when there is one and Today always", () => {
    const now = new Date(2026, 9, 14, 10)
    const at = (d: number) => new Date(2026, 9, d, 12).toISOString()
    expect(whenOf(t("a", "todo", { task_due_date: at(13) }), now)).toBe("overdue")
    expect(whenOf(t("a", "todo", { task_due_date: at(14) }), now)).toBe("today")
    const groups = groupTasks([t("1", "todo", { task_due_date: at(30) }), t("2", "done")], "when", BUILT_IN_STATUSES, { now })
    expect(groups.map((g) => g.key)).toEqual(["today", "later", "done"])
    expect(groups.find((g) => g.key === "done")!.closed).toBe(true)
  })
})

function renderList(tasks: TaskInfoInterface[], onAdd?: () => void, partial?: boolean) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  return render(
    <Provider store={store}>
      <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" onAdd={onAdd} partial={partial} />
    </Provider>,
  )
}

describe("the grouped list (work.md W18, W19)", () => {
  it("shows Done's newest five, then Show N more", () => {
    const done = Array.from({ length: 8 }, (_, i) => t(`d${i}`, "done"))
    renderList([t("1", "todo"), ...done])
    expect(screen.getByRole("button", { name: "Show 3 more" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Show 3 more" }))
    expect(screen.getAllByText(/^Task d/)).toHaveLength(8)
  })

  it("gives every row a check, a hover-only select box, and no status or priority words", () => {
    const { container } = renderList([t("1", "todo"), t("2", "inProgress")])
    expect(container.querySelectorAll("[data-task-check]")).toHaveLength(2)
    const select = container.querySelector("[data-row-select]")!
    expect(select.className).toMatch(/opacity-0/)
    expect(container.querySelector("[data-task-id]")!.className).toContain("h-10")
    expect(screen.queryByText("Medium")).toBeNull()
  })

  // The select box joins while the row is pointed at, and leaves with the
  // pointer; the priority picker is a plain button whose menu joins only when
  // it opens (F-1 #2, components/ui/menuOnDemand).
  it("keeps a row's hover-only controls out of the tree until the row is reached, and lets them go after", () => {
    const { container } = renderList([t("1", "todo"), t("2", "todo")])
    const row = container.querySelector<HTMLElement>("[data-task-id='1']")!
    expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Priority of Task 1" }).getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.pointerEnter(row)
    expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(1)
    fireEvent.pointerLeave(row)
    expect(container.querySelectorAll("[role=checkbox]")).toHaveLength(0)
  })

  it("adds a task in the group its + belongs to", () => {
    const onAdd = vi.fn()
    renderList([t("1", "inProgress")], onAdd)
    fireEvent.click(screen.getByRole("button", { name: "New task in In progress" }))
    const input = screen.getByRole("textbox", { name: "New task in In progress" })
    fireEvent.change(input, { target: { value: "Write the brief" } })
    fireEvent.submit(input.closest("form")!)
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ key: "inProgress" }), "Write the brief")
  })
})

// PROJ-BUG-2: the groups are made from the tasks loaded so far, and the server
// gives no count per group yet. "Urgent 100" with 400 urgent tasks read as the
// whole; on a phone the counts grew as the list scrolled.
describe("a group's count while the list has loaded only part of its tasks", () => {
  const counts = (container: HTMLElement) => [...container.querySelectorAll("[data-group-count]")].map((c) => c.textContent)

  it("says how many have loaded, with a +, while more pages are to come", () => {
    const { container } = renderList([t("1", "todo"), t("2", "todo"), t("3", "inProgress")], undefined, true)
    expect(counts(container)).toEqual(["2+", "1+"])
  })

  it("is the exact count once every task has loaded", () => {
    const { container } = renderList([t("1", "todo"), t("2", "todo"), t("3", "inProgress")])
    expect(counts(container)).toEqual(["2", "1"])
  })

  it("is the same on a phone's list, whose headers are rows of their own", () => {
    const tasks = [t("1", "todo"), t("2", "todo"), t("3", "inProgress")]
    const headers = (more: boolean) => headedRows(tasks, "status", BUILT_IN_STATUSES, more).flatMap((r) => ("kind" in r ? [`${r.label} ${r.count}`] : []))
    expect(headers(true)).toEqual(["To do 2+", "In progress 1+"])
    expect(headers(false)).toEqual(["To do 2", "In progress 1"])
  })
})
