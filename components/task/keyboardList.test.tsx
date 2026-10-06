import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import splitSlice from "@/store/slice/splitSlice"
import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { armGo, disarmGo } from "@/lib/goKeys"
import type { TaskInfoInterface } from "@/types/task"

const bulk = vi.fn(async () => ({ changed: 2, failed: 0, unchanged: 0 }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => bulk }))
vi.mock("@/hooks/useProjectStatuses", () => ({ useProjectStatuses: () => ({ options: BUILT_IN_STATUSES }) }))
vi.mock("@/components/tags/TagPicker", () => ({ useProjectTags: () => ({ tags: [], refresh: () => {} }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))

const { KeyboardList, TaskTableRow } = await import("./KeyboardList")
const { useRowState } = await import("@/hooks/useListSelection")

/** A card as a board draws one, reduced to what the keys need. */
function Card({ t }: { t: TaskInfoInterface }) {
  const { highlighted } = useRowState(t.task_uuid)
  return (
    <div data-task-id={t.task_uuid} tabIndex={0} data-highlighted={highlighted || undefined}>
      {t.task_name}
    </div>
  )
}

const task = (id: string, name: string) => ({ task_uuid: id, task_name: name, task_status: "todo", task_priority: "low", task_label: "" }) as TaskInfoInterface
const TASKS = [task("t1", "Write the copy"), task("t2", "Pick the hero"), task("t3", "Book the retro")]

function renderList() {
  const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
  render(
    <Provider store={store}>
      <div data-split-view="-1">
        <KeyboardList tasks={TASKS} canEdit={() => true} listProjectId="p1" statusOptions={BUILT_IN_STATUSES}>
          <table>
            <tbody>
              {TASKS.map((t) => (
                <TaskTableRow key={t.task_uuid} id={t.task_uuid}>
                  <td>{t.task_name}</td>
                </TaskTableRow>
              ))}
            </tbody>
          </table>
          <input aria-label="Search" />
        </KeyboardList>
      </div>
    </Provider>,
  )
  return store
}

const press = (key: string, extra: Record<string, unknown> = {}) => act(() => void fireEvent.keyDown(document.activeElement ?? document.body, { key, ...extra }))
const row = (name: string) => screen.getByText(name).closest("tr") as HTMLElement

beforeEach(() => bulk.mockClear())
afterEach(() => {
  cleanup()
  disarmGo()
})

describe("a task list from the keyboard", () => {
  it("moves with J and K, selects with X and Shift, and changes the status of the selection", async () => {
    const store = renderList()
    press("j")
    expect(row("Write the copy")).toHaveAttribute("data-highlighted")
    press("j")
    expect(row("Pick the hero")).toHaveAttribute("data-highlighted")
    expect(row("Write the copy")).not.toHaveAttribute("data-highlighted")
    press("x")
    expect(row("Pick the hero")).toHaveAttribute("data-state", "selected")
    expect(screen.getByRole("toolbar", { name: "1 task selected" })).toBeInTheDocument()
    press("K", { shiftKey: true })
    expect(row("Write the copy")).toHaveAttribute("data-state", "selected")
    expect(screen.getByRole("toolbar", { name: "2 tasks selected" })).toBeInTheDocument()

    press("s")
    const search = await screen.findByPlaceholderText("Move to…")
    expect(search).toBeInTheDocument()
    fireEvent.click(screen.getByText("Done"))
    await act(async () => {})
    expect(bulk).toHaveBeenCalledOnce()
    const [tasks, change] = bulk.mock.calls[0] as unknown as [TaskInfoInterface[], { field: string; value: string }]
    expect(tasks.map((t) => t.task_uuid).sort()).toEqual(["t1", "t2"])
    expect(change).toMatchObject({ field: "status", value: "done" })

    press("Escape")
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
  })

  it("opens the highlighted task with Enter", () => {
    const store = renderList()
    press("j")
    press("j")
    press("Enter")
    expect(store.getState().rightPanel.rightPanelState).toMatchObject({ isOpen: true, data: { taskUUID: "t2" } })
  })

  it("edits the highlighted task when nothing is selected", async () => {
    renderList()
    press("j")
    press("p")
    expect(await screen.findByPlaceholderText("Set priority…")).toBeInTheDocument()
    expect(screen.getByRole("toolbar", { name: "1 task selected" })).toBeInTheDocument()
  })

  it("stands aside while typing, and while G waits for its letter", () => {
    renderList()
    const search = screen.getByLabelText("Search")
    search.focus()
    press("j")
    expect(document.querySelector("[data-highlighted]")).toBeNull()
    search.blur()
    armGo(Date.now())
    press("t")
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("picks with Ctrl/⌘-click instead of opening", () => {
    const store = renderList()
    fireEvent.click(screen.getByText("Book the retro"), { metaKey: true })
    expect(row("Book the retro")).toHaveAttribute("data-state", "selected")
    expect(store.getState().rightPanel.rightPanelState.isOpen).toBe(false)
  })
})

describe("a board from the keyboard", () => {
  it("keeps J and K in the column, and crosses with the arrows", () => {
    const store = configureStore({ reducer: { split: splitSlice.reducer, rightPanel: desktopRightPanelSlice.reducer } })
    const [a, b, c] = TASKS
    render(
      <Provider store={store}>
        <div data-split-view="-1">
          <KeyboardList tasks={TASKS} canEdit={() => true} placement="overlay">
            <div data-column="todo">
              <Card t={a} />
              <Card t={b} />
            </div>
            <div data-column="done">
              <Card t={c} />
            </div>
          </KeyboardList>
        </div>
      </Provider>,
    )
    const card = (name: string) => screen.getByText(name)
    press("j")
    press("j")
    press("j")
    expect(card("Pick the hero")).toHaveAttribute("data-highlighted")
    press("ArrowRight")
    expect(card("Book the retro")).toHaveAttribute("data-highlighted")
    // Back at the same height: the first card, as "Book the retro" is the first in its column.
    press("ArrowLeft")
    expect(card("Write the copy")).toHaveAttribute("data-highlighted")
  })
})
