import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ReactElement } from "react"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { createSelectionStore } from "@/lib/listSelection"
import { ListSelectionContext } from "@/hooks/useListSelection"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The rows' dates (made, due) are read against a fixed today.
pinTestClock()

// L-1: the list's rows move by drag, by Alt+↑/↓, and back by Undo, in the
// project's one order (POST /task/moveTask with no status).

const posted: Record<string, unknown>[] = []
let refuse = false
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: vi.fn(async (o: { payload: Record<string, unknown> }) => {
      posted.push(o.payload)
      if (refuse) throw new Error("403")
      return { msg: "Moved task" }
    }),
    isSubmitting: false,
  }),
}))
type Toast = { title?: string; description?: string; action?: ReactElement<{ onClick: () => void; children: string }> }
const toasts: Toast[] = []
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: Toast) => toasts.push(t) }), toast: (t: Toast) => toasts.push(t) }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))
// The project's topic: none here (the live re-sort has its own test, lib/tasks/rankCache).
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "none" }) }))
const revalidated: string[] = []
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: (p: string) => revalidated.push(p) }) }))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")
const { ReorderLayer } = await import("@/components/task/listReorder")
const { ReorderHost } = await import("@/components/task/reorderSlot")
const { TaskListTask } = await import("@/components/task/taskListTask")
const { groupTasks } = await import("@/lib/tasks/grouping")

const t = (id: string, status = "todo", rank?: number) =>
  ({ task_uuid: id, task_name: `Task ${id}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "", task_rank: rank, task_created_at: "2026-10-01T09:00:00Z" }) as unknown as TaskInfoInterface

// The project's order: a, b, c in To do, then p in In progress.
const TASKS = [t("a", "todo", 1024), t("b", "todo", 2048), t("c", "todo", 3072), t("p", "inProgress", 4096)]

beforeEach(() => {
  posted.length = 0
  toasts.length = 0
  revalidated.length = 0
  refuse = false
})
afterEach(cleanup)

function renderList({ manual = true, canEdit = () => true, onManual = vi.fn() }: { manual?: boolean; canEdit?: (t: TaskInfoInterface) => boolean; onManual?: () => void } = {}) {
  const selection = createSelectionStore()
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  const view = render(
    <Provider store={store}>
      <ListSelectionContext.Provider value={selection}>
        <GroupedTaskList
          tasks={TASKS}
          options={BUILT_IN_STATUSES}
          grouping="status"
          props={PROJECT_PROPS}
          canEdit={canEdit}
          projectId="p1"
          reorder={{ projectId: "p1", manual, sortedBy: manual ? undefined : "due date", onManual }}
        />
      </ListSelectionContext.Provider>
    </Provider>,
  )
  return { ...view, selection, onManual }
}

const TODO = BUILT_IN_STATUSES.find((o) => o.value === "todo")!.label
const row = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-task-id='${id}']`)!
const grips = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>("[data-reorder-grip]")]
/** The drag's code is a chunk of its own: it comes once the page is idle. */
const loaded = (c: HTMLElement) => waitFor(() => expect(grips(c).length).toBeGreaterThan(0))
const said = () => document.querySelector("[data-announce]")?.textContent ?? ""

describe("the list's grip", () => {
  it("lends a mouse's press to the drag and keeps it from focusing the grip: the ring is the keys'", async () => {
    const { container } = renderList()
    await loaded(container)
    const grip = grips(container)[0]
    // Not focused, so no ring and no highlight from the press.
    expect(fireEvent.mouseDown(grip, { button: 0, clientX: 4, clientY: 20 })).toBe(false)
    fireEvent.mouseUp(grip)
  })

  it("draws the row's keyboard cursor for the keys' focus only", async () => {
    const { container, selection } = renderList()
    await loaded(container)
    act(() => selection.highlight("a"))
    const cursor = row(container, "a").querySelector("[data-kbd-cursor]")!
    expect(cursor.className).toMatch(/(^| )hidden( |$)/)
    expect(cursor.className).toContain("group-focus-visible/row:block")
    expect(cursor.className).toContain("group-has-[:focus-visible]/row:block")
  })

  it("is on the rows this person may change, and on no read-only row", async () => {
    const { container } = renderList({ canEdit: (task) => task.task_uuid !== "b" })
    await loaded(container)
    expect(row(container, "a").querySelector("[data-reorder-grip]")).not.toBeNull()
    expect(row(container, "b").querySelector("[data-reorder-grip]")).toBeNull()
    expect(row(container, "a").querySelector("[data-reorder-grip]")!.getAttribute("aria-label")).toBe("Move Task a")
  })

  it("shows on hover and on focus, and always on a touch screen", async () => {
    const { container } = renderList()
    await loaded(container)
    const cls = grips(container)[0].className
    expect(cls).toMatch(/group-hover\/row:opacity-100/)
    expect(cls).toMatch(/focus-visible:opacity-100/)
    // With the keys' focus on its row, not a mouse's highlight.
    expect(cls).toContain("group-focus-visible/row:opacity-100")
    expect(cls).not.toContain("group-data-[highlighted=true]")
    expect(cls).toMatch(/\[@media\(hover:none\)\]:opacity-100/)
    expect(grips(container)[0].hasAttribute("data-drag-handle")).toBe(true)
  })
})

describe("Alt+↑ and Alt+↓", () => {
  it("move the highlighted task one place in the project's order, and say so", async () => {
    const { container, selection } = renderList()
    await loaded(container)
    act(() => selection.highlight("a"))
    fireEvent.keyDown(row(container, "a"), { key: "ArrowDown", altKey: true })
    await waitFor(() => expect(posted).toHaveLength(1))
    // No status: the Task Writer's rank op, not a board move.
    expect(posted[0]).toEqual({ task_uuid: "a", before_task_uuid: "b", after_task_uuid: "c" })
    await waitFor(() => expect(said()).toBe(`Task a moved to position 2 of 3 in ${TODO}.`))
  })

  it("say so at an end, and send nothing", async () => {
    const { container, selection } = renderList()
    await loaded(container)
    act(() => selection.highlight("a"))
    fireEvent.keyDown(row(container, "a"), { key: "ArrowUp", altKey: true })
    await waitFor(() => expect(said()).toBe(`Task a is already first in ${TODO}.`))
    expect(posted).toHaveLength(0)
  })

  it("move a selection together, keeping its order, one request after another", async () => {
    const { container, selection } = renderList()
    await loaded(container)
    act(() => {
      selection.toggle("b")
      selection.toggle("c")
      selection.highlight("c")
    })
    fireEvent.keyDown(row(container, "c"), { key: "ArrowUp", altKey: true })
    await waitFor(() => expect(posted).toHaveLength(2))
    expect(posted).toEqual([
      { task_uuid: "b", before_task_uuid: "", after_task_uuid: "a" },
      { task_uuid: "c", before_task_uuid: "b", after_task_uuid: "a" },
    ])
  })

  it("ask to switch to manual order when the list is sorted by something else, and move nothing", async () => {
    const onManual = vi.fn()
    const { container, selection } = renderList({ manual: false, onManual })
    await loaded(container)
    act(() => selection.highlight("a"))
    fireEvent.keyDown(row(container, "a"), { key: "ArrowDown", altKey: true })
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(posted).toHaveLength(0)
    expect(toasts[0].title).toBe("Sorted by due date")
    expect(toasts[0].action!.props.children).toBe("Use manual order")
    act(() => toasts[0].action!.props.onClick())
    expect(onManual).toHaveBeenCalled()
  })
})

describe("the keys' drag from a grip", () => {
  it("lifts the row with Space, moves it a row at a time with the arrows, and puts it down with Space", async () => {
    // jsdom lays nothing out: the list's rows stand 40px apart, in their order.
    const rect = (top: number, height: number, width = 600) => ({ x: 0, y: top, top, left: 0, width, height, right: width, bottom: top + height, toJSON: () => ({}) })
    const layout = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const rows = [...document.querySelectorAll("[data-grouped-list] [data-task-id]")]
      const i = rows.indexOf(this)
      if (i >= 0) return rect(i * 40, 40) as DOMRect
      if (this.matches("[data-grouped-list]")) return rect(0, rows.length * 40) as DOMRect
      return rect(0, 0, 0) as DOMRect
    })
    try {
      const { container } = renderList()
      await loaded(container)
      const grip = row(container, "a").querySelector<HTMLElement>("[data-reorder-grip]")!
      fireEvent.keyDown(grip, { code: "Space", key: " " })
      // The sensor listens for the next keys from the following tick.
      await act(() => new Promise((r) => setTimeout(r, 0)))
      expect(document.body.querySelector("[data-reorder-lift]")).not.toBeNull()
      const line = () => document.body.querySelector<HTMLElement>("[data-drop-line]")
      // One row down is where it is: no line.
      fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" })
      await waitFor(() => expect(line()?.style.display).toBe("none"))
      // Two rows down, between b and c: the line shows the gap.
      fireEvent.keyDown(document, { code: "ArrowDown", key: "ArrowDown" })
      await waitFor(() => expect(line()?.style.display).toBe(""))
      // The row it left dims where it was (app/interaction.css), and the rows past the slot make room.
      expect(row(container, "a").hasAttribute("data-reorder-held")).toBe(true)
      expect(row(container, "c").hasAttribute("data-room-shift")).toBe(true)
      expect(row(container, "b").hasAttribute("data-room-shift")).toBe(false)
      fireEvent.keyDown(document, { code: "Space", key: " " })
      await waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toEqual({ task_uuid: "a", before_task_uuid: "b", after_task_uuid: "c" })
      expect(document.body.querySelector("[data-reorder-lift]")).toBeNull()
      expect(document.body.querySelector("[data-drop-line]")).toBeNull()
    } finally {
      layout.mockRestore()
    }
  })
})

describe("a drag while the list is sorted by something else", () => {
  it("asks to switch to manual order as the press starts, once, and moves nothing", async () => {
    const { container } = renderList({ manual: false })
    await loaded(container)
    // A drag's press: asked at once, though the release lands elsewhere (no click).
    fireEvent.pointerDown(grips(container)[0])
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0].title).toBe("Sorted by due date")
    // The pointer's own click after it asks nothing more.
    fireEvent.click(grips(container)[0], { detail: 1 })
    expect(toasts).toHaveLength(1)
    expect(posted).toHaveLength(0)
  })

  it("asks from the keys too: Enter or Space on the grip", async () => {
    const { container } = renderList({ manual: false })
    await loaded(container)
    // A key's click carries no pointer (detail 0).
    fireEvent.click(grips(container)[0], { detail: 0 })
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0].action!.props.children).toBe("Use manual order")
  })
})

describe("undo", () => {
  it("puts a moved task back between its old neighbours", async () => {
    const { container, selection } = renderList()
    await loaded(container)
    act(() => selection.highlight("a"))
    fireEvent.keyDown(row(container, "a"), { key: "ArrowDown", altKey: true })
    await waitFor(() => expect(toasts.some((x) => x.action?.props.children === "Undo")).toBe(true))
    const undo = toasts.find((x) => x.action?.props.children === "Undo")!
    act(() => undo.action!.props.onClick())
    await waitFor(() => expect(posted).toHaveLength(2))
    expect(posted[1]).toEqual({ task_uuid: "a", before_task_uuid: "", after_task_uuid: "b" })
  })
})

describe("a refused move", () => {
  it("reads the project's lists again, and offers no undo", async () => {
    refuse = true
    const { container, selection } = renderList()
    await loaded(container)
    act(() => selection.highlight("a"))
    fireEvent.keyDown(row(container, "a"), { key: "ArrowDown", altKey: true })
    await waitFor(() => expect(revalidated).toEqual(["p1"]))
    expect(toasts.some((x) => x.action?.props.children === "Undo")).toBe(false)
  })
})

describe("a phone's row", () => {
  const store = () => configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
  const phone = ({ manual = true, onManual = vi.fn() }: { manual?: boolean; onManual?: () => void } = {}) => {
    const box = { current: null as HTMLDivElement | null }
    return render(
      <Provider store={store()}>
        <ReorderHost>
          <div
            ref={(el) => {
              box.current = el
            }}
          >
            {TASKS.map((task) => (
              <TaskListTask key={task.task_uuid} taskInfo={task} isAdmin={task.task_uuid !== "b"} onToggleStatus={vi.fn()} isAnimating={false} />
            ))}
          </div>
          <ReorderLayer projectId="p1" manual={manual} sortedBy={manual ? undefined : "due date"} onManual={onManual} tasks={TASKS} groups={groupTasks(TASKS, "status", BUILT_IN_STATUSES)} grouping="status" options={BUILT_IN_STATUSES} canEdit={() => true} box={box} />
        </ReorderHost>
      </Provider>,
    )
  }
  const swipeRow = (c: HTMLElement, id: string) => row(c, id).querySelector<HTMLElement>("[data-swipe-row]")!
  /** A finger on (x, y), held: PRESS_LIFT's 250 ms and a little. */
  const holdOn = async (el: HTMLElement) => {
    fireEvent.touchStart(el, { touches: [{ clientX: 120, clientY: 20 }] })
    await act(() => new Promise((r) => setTimeout(r, 320)))
  }

  it("has no standing grip: held still, the row itself lifts, and the lifted copy wears the grip", async () => {
    const { container } = phone()
    expect(container.querySelector("[data-reorder-grip]")).toBeNull()
    await holdOn(swipeRow(container, "a"))
    const lifted = document.body.querySelector("[data-reorder-lift]")
    expect(lifted).not.toBeNull()
    expect(lifted!.querySelector("svg")).not.toBeNull()
    expect(row(container, "a").hasAttribute("data-reorder-held")).toBe(true)
    fireEvent.touchEnd(swipeRow(container, "a"), { changedTouches: [{ clientX: 120, clientY: 20 }] })
    await waitFor(() => expect(document.body.querySelector("[data-reorder-lift]")).toBeNull())
    expect(row(container, "a").hasAttribute("data-reorder-held")).toBe(false)
  })

  it("leaves the check's own long press to it (the status picker), and lifts no row the reader can't change", async () => {
    const { container } = phone()
    await holdOn(row(container, "a").querySelector<HTMLElement>("[data-task-check]")!)
    expect(document.body.querySelector("[data-reorder-lift]")).toBeNull()
    fireEvent.touchEnd(row(container, "a").querySelector<HTMLElement>("[data-task-check]")!)
    await holdOn(swipeRow(container, "b"))
    expect(document.body.querySelector("[data-reorder-lift]")).toBeNull()
  })

  // A touch scroll waits for the main thread while anything on the page
  // listens to touchmove without passive: dnd-kit's TouchSensor put such a
  // listener on the window for as long as the list was open (FLUID17-P2).
  it("adds no blocking touchmove to the window until a hold lifts a row, so the list scrolls as in any other sort", async () => {
    const added = vi.spyOn(window, "addEventListener")
    const removed = vi.spyOn(window, "removeEventListener")
    const blocking = (calls: unknown[][]) => calls.filter(([type, , opts]) => type === "touchmove" && typeof opts === "object" && opts !== null && (opts as AddEventListenerOptions).passive === false)
    try {
      const { container } = phone()
      await act(() => new Promise((r) => setTimeout(r, 0)))
      expect(blocking(added.mock.calls)).toHaveLength(0)
      // Held still for 250 ms, a row lifts: now the finger carries it, and the page must not scroll.
      await holdOn(swipeRow(container, "a"))
      expect(document.body.querySelector("[data-reorder-lift]")).not.toBeNull()
      expect(blocking(added.mock.calls).length).toBeGreaterThan(0)
      fireEvent.touchEnd(swipeRow(container, "a"), { changedTouches: [{ clientX: 120, clientY: 20 }] })
      await waitFor(() => expect(document.body.querySelector("[data-reorder-lift]")).toBeNull())
      expect(removed.mock.calls.filter(([type]) => type === "touchmove").length).toBeGreaterThanOrEqual(blocking(added.mock.calls).length)
    } finally {
      added.mockRestore()
      removed.mockRestore()
    }
  })

  // iOS settles at touchstart whether a touch's moves can be cancelled: one
  // added as a hold lifts comes too late, so an iPhone keeps dnd-kit's own.
  it("keeps the standing touchmove listener on an iPhone, from the list's mount", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    Object.defineProperty(window.navigator, "maxTouchPoints", { value: 5, configurable: true })
    const added = vi.spyOn(window, "addEventListener")
    try {
      phone()
      await act(() => new Promise((r) => setTimeout(r, 0)))
      expect(added.mock.calls.filter(([type, , opts]) => type === "touchmove" && (opts as AddEventListenerOptions | undefined)?.passive === false)).toHaveLength(1)
    } finally {
      vi.restoreAllMocks()
      Object.defineProperty(window.navigator, "maxTouchPoints", { value: 0, configurable: true })
    }
  })

  it("asks to switch to manual order when held under another sort, and lifts nothing", async () => {
    const { container } = phone({ manual: false })
    await holdOn(swipeRow(container, "a"))
    await waitFor(() => expect(toasts).toHaveLength(1))
    expect(toasts[0].title).toBe("Sorted by due date")
    expect(document.body.querySelector("[data-reorder-lift]")).toBeNull()
    fireEvent.touchEnd(swipeRow(container, "a"))
  })
})
