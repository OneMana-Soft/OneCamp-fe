import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { createSelectionStore } from "@/lib/listSelection"
import { ListSelectionContext } from "@/hooks/useListSelection"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The rows show dates (made): read against a fixed today.
pinTestClock()

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({ msg: "ok" })), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "none" }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

// The drag's code (L-1) is fetched when the page is idle: here, when the test says so.
let idle: (() => void) | null = null
beforeAll(async () => {
  window.requestIdleCallback = ((cb: IdleRequestCallback) => {
    idle = () => cb({ didTimeout: false, timeRemaining: () => 50 })
    return 1
  }) as typeof window.requestIdleCallback
  window.cancelIdleCallback = () => undefined
  // Compiled ahead, so the list's import of it resolves when asked.
  await import("@/components/task/listReorder")
}, 30_000)
afterEach(cleanup)

const t = (id: string, status = "todo") =>
  ({ task_uuid: id, task_name: `Task ${id}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "", task_created_at: "2026-10-01T09:00:00Z" }) as unknown as TaskInfoInterface
const TODO = BUILT_IN_STATUSES.find((o) => o.value === "todo")!.label

// The drag's layer came about 1.5 s after a list opened, and wrapped the list:
// React drew the whole list anew, so a row in hand, a "+" field's half-typed
// words and the keys' focus were all lost.
describe("a list in its manual order, as the drag's code arrives", () => {
  it("keeps its rows, an open “+” field's words and the focus: nothing is drawn anew", async () => {
    const { container } = render(
      <Provider store={configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })}>
        <ListSelectionContext.Provider value={createSelectionStore()}>
          <GroupedTaskList
            tasks={[t("a"), t("b"), t("p", "inProgress")]}
            options={BUILT_IN_STATUSES}
            grouping="status"
            props={PROJECT_PROPS}
            canEdit={() => true}
            projectId="p1"
            onAdd={vi.fn()}
            reorder={{ projectId: "p1", manual: true, onManual: vi.fn() }}
          />
        </ListSelectionContext.Provider>
      </Provider>,
    )
    const row = container.querySelector<HTMLElement>("[data-task-id='b']")!
    fireEvent.click(screen.getByRole("button", { name: `New task in ${TODO}` }))
    // The field may be a chunk of its own: it comes a moment after the click.
    fireEvent.change(await screen.findByRole("textbox", { name: `New task in ${TODO}` }), { target: { value: "Half a thought" } })
    act(() => row.focus())
    expect(container.querySelector("[data-reorder-grip]"), "the drag's code isn't here yet").toBeNull()

    act(() => idle?.())
    await waitFor(() => expect(container.querySelector("[data-reorder-grip]")).not.toBeNull())

    expect(container.querySelector("[data-task-id='b']"), "the same row").toBe(row)
    expect(screen.getByRole("textbox", { name: `New task in ${TODO}` })).toHaveValue("Half a thought")
    expect(document.activeElement, "the focus stays").toBe(row)
  })
})
