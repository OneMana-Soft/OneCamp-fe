import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ComponentProps } from "react"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { createSelectionStore } from "@/lib/listSelection"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { placeTasks } from "@/lib/tasks/listOrder"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TaskInfoInterface } from "@/types/task"

// L-1 at 60 fps (the owner's rule; FLUIDITY-LEAD's listDrag step: frame p95
// within 16.7 ms, under 5% dropped, the drop shown within 100 ms). A frame
// that draws rows can't hold that on a long list, so this holds what a drag
// draws: a row carried down 40 of 60 rows draws no row and no grip again, the
// rows past the slot make room with one write per step, and the drop draws
// only the moved row.

pinTestClock()

/** Rows drawn, by task: a row draws its check once each time it renders. */
const rows = new Map<string, number>()
/** Grip marks drawn: every row's grip, and the lifted copy's. */
let marks = 0
vi.mock("@/components/task/TaskCheck", async (load) => {
  const real = await load<typeof import("@/components/task/TaskCheck")>()
  const Counted = (p: ComponentProps<typeof real.TaskCheck>) => {
    rows.set(p.taskName, (rows.get(p.taskName) ?? 0) + 1)
    return <real.TaskCheck {...p} />
  }
  return { ...real, TaskCheck: Counted }
})
vi.mock("@/lib/icons", async (load) => {
  const real = await load<typeof import("@/lib/icons")>()
  const Mark = real.GripVertical
  const Counted = (p: ComponentProps<typeof Mark>) => {
    marks++
    return <Mark {...p} />
  }
  return { ...real, GripVertical: Counted }
})
const posted: Record<string, unknown>[] = []
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: vi.fn(async (o: { payload: Record<string, unknown> }) => {
      posted.push(o.payload)
      return { msg: "Moved task" }
    }),
    isSubmitting: false,
  }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "none" }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

type Task = TaskInfoInterface & { task_rank?: number }
const t = (i: number) =>
  ({ task_uuid: `r${i}`, task_name: `Task ${i}`, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "", task_rank: (i + 1) * 1024, task_created_at: "2026-10-01T09:00:00Z" }) as unknown as Task
const SIXTY = Array.from({ length: 60 }, (_, i) => t(i))
const ROW = 40

const total = () => [...rows.values()].reduce((a, b) => a + b, 0)
const canEdit = () => true
const reorder = { projectId: "p1", manual: true, onManual: () => {} }

// jsdom has no hit testing: the shared edge scroll (lib/ui/edgeScroll) finds no scroller.
if (typeof document.elementsFromPoint !== "function") Object.defineProperty(document, "elementsFromPoint", { value: () => [], configurable: true })

let layout: { mockRestore: () => void } | null = null
/** The window's height: all 60 rows (2,400px) on screen, unless a test says otherwise. */
const tallWindow = (px: number) => Object.defineProperty(window, "innerHeight", { value: px, configurable: true, writable: true })
const jsdomHeight = window.innerHeight
beforeEach(() => {
  tallWindow(3000)
  rows.clear()
  marks = 0
  posted.length = 0
  // jsdom lays nothing out: the list's rows stand 40px apart, in their order.
  const rect = (top: number, height: number, width = 600) => ({ x: 0, y: top, top, left: 0, width, height, right: width, bottom: top + height, toJSON: () => ({}) })
  layout = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const all = [...document.querySelectorAll("[data-grouped-list] [data-task-id]")]
    const i = all.indexOf(this)
    if (i >= 0) return rect(i * ROW, ROW) as DOMRect
    if (this.matches("[data-grouped-list]")) return rect(0, all.length * ROW) as DOMRect
    return rect(0, 0, 0) as DOMRect
  })
})
afterEach(() => {
  cleanup()
  layout?.mockRestore()
  tallWindow(jsdomHeight)
})

function renderList(tasks: Task[]) {
  const selection = createSelectionStore()
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  const tree = (list: Task[]) => (
    <Provider store={store}>
      <ListSelectionContext.Provider value={selection}>
        <GroupedTaskList tasks={list} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={canEdit} projectId="p1" reorder={reorder} />
      </ListSelectionContext.Provider>
    </Provider>
  )
  const view = render(tree(tasks))
  return { ...view, again: (list: Task[]) => view.rerender(tree(list)) }
}

const frame = () => act(() => new Promise((r) => requestAnimationFrame(() => r(null))))
const shifted = (c: HTMLElement, i: number) => c.querySelector(`[data-task-id="r${i}"]`)!.hasAttribute("data-room-shift")

describe("a drag down a list of 60 rows", () => {
  it("draws no row and no grip again while the pointer moves, opens the slot under the copy one write a step, and the drop draws only the moved row", async () => {
    const { container, again } = renderList(SIXTY)
    await waitFor(() => expect(container.querySelectorAll("[data-reorder-grip]")).toHaveLength(60))
    const grip = container.querySelector<HTMLElement>('[data-task-id="r2"] [data-reorder-grip]')!
    rows.clear()
    marks = 0
    // Pressed on the grip, in the middle of row 2, then carried 10px: the mouse sensor lifts after 5.
    const x = 10
    const y0 = 2 * ROW + 20
    fireEvent.mouseDown(grip, { button: 0, clientX: x, clientY: y0 })
    fireEvent.mouseMove(document, { clientX: x, clientY: y0 + 10 })
    await act(() => new Promise((r) => setTimeout(r, 0)))
    expect(document.body.querySelector("[data-reorder-lift]")).not.toBeNull()
    await frame()
    const lift = { rows: total(), marks }

    // Down 40 rows, a row at a time, the copy's middle 10px into a row each
    // step: that row and every one past it make room, by attributes alone.
    let written = 0
    const writes = new MutationObserver((records) => (written += records.length))
    writes.observe(container, { attributes: true, subtree: true, attributeFilter: ["data-room-shift"] })
    const perStep: number[] = []
    for (let k = 1; k <= 40; k++) {
      const before = written
      fireEvent.mouseMove(document, { clientX: x + 4, clientY: y0 + 30 + k * ROW })
      await frame()
      written += writes.takeRecords().length
      perStep.push(written - before)
    }
    writes.disconnect()
    const moves = { rows: total() - lift.rows, marks: marks - lift.marks }
    expect(document.body.querySelector<HTMLElement>("[data-drop-line]")?.style.display).toBe("")
    // The copy is over row 43: it and the rows past it have moved down, row 42 hasn't.
    const room = { r3: shifted(container, 3), r42: shifted(container, 42), r43: shifted(container, 43), r59: shifted(container, 59) }
    fireEvent.mouseUp(document, { clientX: x + 4, clientY: y0 + 30 + 40 * ROW })
    await waitFor(() => expect(posted).toHaveLength(1))

    // Lifting draws the lifted copy and nothing on the list.
    expect.soft(lift.rows, "rows drawn on lift").toBe(0)
    expect.soft(lift.marks, "grip marks drawn on lift").toBeLessThanOrEqual(1)
    // Forty rows crossed: no row and no grip drawn again.
    expect.soft(moves.rows, "rows drawn over 40 moves").toBe(0)
    expect.soft(moves.marks, "grip marks drawn over 40 moves").toBe(0)
    expect.soft(room, "the rows that made room under the copy").toEqual({ r3: false, r42: false, r43: true, r59: true })
    // The first step opens the slot (every row past it); each step after
    // moves it one row, which is one row's attribute, never the whole list.
    expect.soft(perStep[0], "attribute writes as the slot opens").toBeGreaterThan(0)
    expect.soft(Math.max(...perStep.slice(1)), "attribute writes in a step after").toBeLessThanOrEqual(1)
    // Let go over row 43, its top quarter: between rows 42 and 43.
    expect.soft(posted[0]).toEqual({ task_uuid: "r2", before_task_uuid: "r42", after_task_uuid: "r43" })

    // The list comes back in its new order, as the move leaves it: only the
    // moved task is a new object. Only its row draws, and the room closes.
    rows.clear()
    marks = 0
    again(placeTasks(SIXTY, { ids: ["r2"], before: "r42", after: "r43" }, { r2: 42.5 * 1024 }))
    expect.soft(total(), "rows drawn on the re-render in the new order").toBeLessThanOrEqual(1)
    expect.soft(marks, "grip marks drawn on the re-render").toBeLessThanOrEqual(1)
    expect.soft(container.querySelector("[data-room-shift]"), "rows still moved aside").toBeNull()
    expect.soft(container.querySelector("[data-reorder-held]"), "rows still dimmed").toBeNull()
  }, 30_000)

  it("moves only the rows on screen to make room: each row whose transform comes or goes is laid out again", async () => {
    // A window 800px tall: rows 0 to 19 are on it, and two rows' height past it.
    tallWindow(800)
    const { container } = renderList(SIXTY)
    await waitFor(() => expect(container.querySelectorAll("[data-reorder-grip]")).toHaveLength(60))
    const grip = container.querySelector<HTMLElement>('[data-task-id="r2"] [data-reorder-grip]')!
    const x = 10
    const y0 = 2 * ROW + 20
    fireEvent.mouseDown(grip, { button: 0, clientX: x, clientY: y0 })
    fireEvent.mouseMove(document, { clientX: x, clientY: y0 + 10 })
    await act(() => new Promise((r) => setTimeout(r, 0)))
    // Over row 10: it and the rows after it on screen make room; the rest of the list stays put.
    fireEvent.mouseMove(document, { clientX: x + 4, clientY: 10 * ROW + 10 })
    await frame()
    expect(shifted(container, 9)).toBe(false)
    expect(shifted(container, 10)).toBe(true)
    expect(shifted(container, 21)).toBe(true)
    expect(shifted(container, 30)).toBe(false)
    expect(container.querySelectorAll("[data-room-flow]").length).toBeLessThan(30)
    fireEvent.mouseUp(document, { clientX: x + 4, clientY: 10 * ROW + 10 })
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({ task_uuid: "r2", before_task_uuid: "r9", after_task_uuid: "r10" })
  }, 30_000)
})
