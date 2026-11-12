import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// A task list's two chunks whose code can't load (offline, where
// lib/chunkRecovery doesn't reload the page): the window a long list draws
// (components/task/listWindow) and the drag's layer (components/task/
// listReorder). Their raw import() had no failure path: the rejection went
// unhandled and nothing tried again. The list draws every row and no grip, and
// the page carries on (lib/lazy/lazyPart tries again once back online).
vi.mock("@/components/task/listWindow", () => {
  throw new Error("Loading chunk listWindow failed")
})
vi.mock("@/components/task/listReorder", () => {
  throw new Error("Loading chunk listReorder failed")
})
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const t = (i: number) => ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface

function renderList(count: number, reorder?: { projectId: string; manual: boolean; onManual: () => void }) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  return render(
    <Provider store={store}>
      <GroupedTaskList tasks={Array.from({ length: count }, (_, i) => t(i))} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" reorder={reorder} />
    </Provider>,
  )
}

describe("a task list whose chunks can't load", () => {
  it("draws a long list's rows without its window, and carries on", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { container } = renderList(250)
    await waitFor(() => expect(warn).toHaveBeenCalled())
    // The group's first sixty, as a list too short to window draws them.
    expect(container.querySelectorAll("[data-grouped-list] [data-task-id]")).toHaveLength(60)
    expect(screen.getByRole("button", { name: "Show 190 more" })).toBeTruthy()
    // Past 200 rows shown, the screen's worth a list draws till its window plans gives way to every row.
    fireEvent.click(screen.getByRole("button", { name: "Show 190 more" }))
    expect(container.querySelectorAll("[data-grouped-list] [data-task-id]")).toHaveLength(250)
  })

  it("draws its rows and no grip when the drag's code can't come", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    // The drag's code is fetched once the page is idle (jsdom has no idle callback: a timer stands in).
    const { container } = renderList(3, { projectId: "p", manual: true, onManual: () => {} })
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(container.querySelectorAll("[data-grouped-list] [data-task-id]")).toHaveLength(3)
    expect(container.querySelectorAll("[data-reorder-grip]")).toHaveLength(0)
    expect(screen.getByText("Task 2")).toBeTruthy()
  })
})
