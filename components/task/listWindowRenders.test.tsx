import { renders } from "@/lib/testing/reactRenders"
import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { createSelectionStore, type SelectionStore } from "@/lib/listSelection"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { ListReorder } from "@/components/task/reorderSlot"
import type { TaskInfoInterface } from "@/types/task"

// A windowed list's renders (FLUIDITY-LEAD-10's rounds on Part B, 22 Oct
// 2026): renders per J rose from 78.9 to 93.3 and a page of tasks from 1,790
// to 2,546. Each step of the window drew every group's header and the drag
// layer again, and a row drew all its cells again for its own state: the
// keys' highlight and focus, and its place among its group's rows
// (aria-setsize, aria-posinset), which a page that adds to the group changes
// for each row drawn. A row's cells are counted by its title, a header by its
// count, and the drag layer by its move hook, which it calls once a render.
const drawn = vi.hoisted(() => ({ titles: [] as string[], counts: 0, layers: 0 }))
vi.mock("@/components/task/TaskCheck", async (orig) => {
  const real = await orig<typeof import("@/components/task/TaskCheck")>()
  return {
    ...real,
    TaskTitle: (props: React.ComponentProps<typeof real.TaskTitle>) => {
      drawn.titles.push(String(props.children))
      return <real.TaskTitle {...props} />
    },
  }
})
vi.mock("@/components/ui/CountTick", async (orig) => {
  const real = await orig<typeof import("@/components/ui/CountTick")>()
  return {
    ...real,
    CountTick: (props: React.ComponentProps<typeof real.CountTick>) => {
      drawn.counts++
      return <real.CountTick {...props} />
    },
  }
})
// Nothing is moved here, so the move itself is a stand-in.
vi.mock("@/hooks/useListMove", async (orig) => {
  const real = await orig<typeof import("@/hooks/useListMove")>()
  const move: ReturnType<typeof real.useListMove> = async () => true
  return {
    ...real,
    useListMove: () => {
      drawn.layers++
      return move
    },
  }
})
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

// The window and the drag come as chunks (the window as a list passes 200 tasks, the drag when the page is idle): here,
// fetched first, as a page has long since.
beforeAll(async () => {
  await import("@/components/task/listWindow")
  await import("@/components/task/listReorder")
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  reveals.length = 0
})

/**
 * The page's scroller as a computer lays it out: 800 px tall at the screen's top, scrolled where the test or the keys'
 * reveal puts it. jsdom lays nothing out. Backlog's rows sit below its 36 px head, 40 px each (the keys walk them
 * here). The reveal's scrollIntoView scrolls as a browser's "nearest" would, and each call is kept: on which row,
 * whether the row was drawn, and whether it asked for "nearest" both ways.
 */
const SCREEN = 800
const reveals: Array<{ id: string; drawn: boolean; nearest: boolean }> = []
function layOutScroller() {
  const tops = new WeakMap<Element, number>()
  const isScroller = (el: Element) => el.hasAttribute("data-list-scroller")
  const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get")
  height.mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? SCREEN : 0
  })
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    return isScroller(this) ? SCREEN : 0
  })
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return isScroller(this) ? 1_000_000 : 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    return tops.get(this) ?? 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, v: number) {
    tops.set(this, v)
  })
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 1000, width: 1000, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    if (isScroller(this)) return box(0, SCREEN)
    const id = this.getAttribute("data-task-id")
    if (!id) return box(0, 0)
    const scroller = this.closest("[data-list-scroller]")
    const place = this.closest("[data-group='backlog']") ? Number(this.getAttribute("aria-posinset")) - 1 : 1_000
    return box(36 + place * 40 - (scroller ? (tops.get(scroller) ?? 0) : 0), 40)
  })
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    const nearest = typeof arg === "object" && arg.block === "nearest" && arg.inline === "nearest"
    reveals.push({ id: this.getAttribute("data-task-id") ?? "", drawn: this.isConnected, nearest })
    const scroller = this.closest("[data-list-scroller]")
    if (!scroller) return
    const r = this.getBoundingClientRect()
    const by = r.top < 0 ? r.top : r.bottom > SCREEN ? r.bottom - SCREEN : 0
    if (by) scroller.scrollTop = (tops.get(scroller) ?? 0) + by
  })
}
/** The frame after a key: what a browser runs before it paints (the keys' reveal scrolls there). */
const frame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())))
/** Where the highlighted row sits in the screen now: wholly in view, or not. */
const inView = (c: HTMLElement, id: string | null) => {
  const r = id ? c.querySelector(`[data-task-id="${id}"]`)?.getBoundingClientRect() : undefined
  return !!r && r.top >= 0 && r.bottom <= SCREEN
}

let n = 0
const t = (status: string) => ({ task_uuid: `t${n}`, task_name: `Task ${n++}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface
const some = (count: number, status: string) => Array.from({ length: count }, () => t(status))
const canEdit = () => true
/** A project in its manual order: rows move by drag, so the drag's layer sits beside the list. */
const MANUAL: ListReorder = { projectId: "p", manual: true, onManual: () => undefined }

function renderList(tasks: TaskInfoInterface[], reorder?: ListReorder) {
  layOutScroller()
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer, split: splitSlice.reducer } })
  const selection = createSelectionStore()
  // As a project's page: the keys (hooks/useListKeyboard) over the list, in the page's scroller, in the view they serve.
  function Page({ tasks }: { tasks: TaskInfoInterface[] }) {
    const keys = React.useRef<HTMLDivElement>(null)
    useListKeyboard({ containerRef: keys, store: selection, enabled: true })
    return (
      <ListSelectionContext.Provider value={selection}>
        <div data-split-view="-1" data-list-scroller="" style={{ overflowY: "auto", height: SCREEN }}>
          <div ref={keys}>
            <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={canEdit} projectId="p" reorder={reorder} />
          </div>
        </div>
      </ListSelectionContext.Provider>
    )
  }
  const view = render(
    <Provider store={store}>
      <Page tasks={tasks} />
    </Provider>,
  )
  const scroller = view.container.querySelector<HTMLElement>("[data-list-scroller]")!
  return {
    ...view,
    selection,
    scroller,
    page: (next: TaskInfoInterface[]) =>
      view.rerender(
        <Provider store={store}>
          <Page tasks={next} />
        </Provider>,
      ),
  }
}

/** The list's window is on: its groups' lists are planned. */
const windowed = (c: HTMLElement) => waitFor(() => expect(c.querySelector("[role=list][data-rows]")).not.toBeNull())
/** The titles of the rows drawn now (task tN is "Task N"). */
const drawnTitles = (c: HTMLElement) => new Set(Array.from(c.querySelectorAll("[data-grouped-list] [data-task-id]"), (r) => `Task ${r.getAttribute("data-task-id")?.slice(1)}`))
/** Starts the count, and says which rows are drawn as it starts. */
function countFrom(c: HTMLElement) {
  drawn.titles = []
  drawn.counts = 0
  drawn.layers = 0
  return drawnTitles(c)
}
/** The titles drawn since the count began whose rows were drawn before it: their cells drawn again. */
const again = (before: Set<string>) => drawn.titles.filter((title) => before.has(title))
/** Whether rows have come into the window since the count began. */
const cameIn = (c: HTMLElement, before: Set<string>) => [...drawnTitles(c)].some((title) => !before.has(title))

/**
 * J ten times from the last row on the screen (Backlog's 36 px head and nineteen 40 px rows: t18). The keys' reveal
 * scrolls each next row into view in its frame (lib/ui/listNav revealRow), a row's height, and the scroller says so,
 * so the window steps as the keys go.
 */
async function pressJ(c: HTMLElement, selection: SelectionStore, scroller: HTMLElement) {
  act(() => selection.highlight("t18"))
  const before = countFrom(c)
  for (let i = 1; i <= 10; i++) {
    fireEvent.keyDown(document.body, { key: "j" })
    await frame()
    act(() => void fireEvent.scroll(scroller))
    expect(inView(c, selection.get().highlighted), `J ${i}: its row wholly in view`).toBe(true)
  }
  expect(selection.get().highlighted).toBe("t28")
  expect(document.activeElement?.getAttribute("data-task-id")).toBe("t28")
  // t19 to t28 each past the screen's bottom edge: scrolled to show the row's bottom at it.
  expect(scroller.scrollTop).toBe(36 + 29 * 40 - SCREEN)
  expect(cameIn(c, before), "the window moved").toBe(true)
  return before
}

describe("a windowed list's renders", () => {
  // A project's first page, ordered as the list groups it: Backlog 40, To do 100, In progress 100, In review 50, Done 50.
  // Shown: 40 + 60 + 60 + 50 + the newest 5 done, 215 rows, so the list is windowed.
  const firstPage = () => {
    n = 0
    return [...some(40, "backlog"), ...some(100, "todo"), ...some(100, "inProgress"), ...some(50, "inReview"), ...some(50, "done")]
  }

  it("steps the window with J and draws no group header again", async () => {
    const { container, selection, scroller } = renderList(firstPage())
    await windowed(container)
    await pressJ(container, selection, scroller)
    expect(drawn.counts, "group headers drawn again").toBe(0)
  })

  it("draws a row's frame for the keys' highlight and focus, and its cells only as it comes into the window", async () => {
    const { container, selection, scroller } = renderList(firstPage())
    await windowed(container)
    const before = await pressJ(container, selection, scroller)
    // The rows that came into the window drew their cells, once each.
    expect(drawn.titles.length).toBeGreaterThan(0)
    expect(new Set(drawn.titles).size).toBe(drawn.titles.length)
    expect(again(before), "rows drawn before that drew their cells again").toEqual([])
  })

  it("draws only the cells of the rows a page brings, not again the rows drawn whose place among their group's rows it changes", async () => {
    const first = firstPage()
    const { container, page } = renderList(first)
    await windowed(container)
    const backlog = () => container.querySelector("[data-group='backlog'] > [role=list]")
    expect(backlog()?.getAttribute("data-rows")).toBe("40")
    const before = countFrom(container)
    // The next page: fifteen more in Backlog, which then shows 55, so each Backlog row says 1 of 55, not 1 of 40.
    act(() => page([...first, ...some(15, "backlog"), ...some(100, "todo")]))
    await waitFor(() => expect(backlog()?.getAttribute("data-rows")).toBe("55"))
    expect(container.querySelector("[data-group='backlog'] [data-task-id]")?.getAttribute("aria-setsize")).toBe("55")
    expect(again(before), "rows drawn before that drew their cells again").toEqual([])
  })

  it("steps the window in a project's manual order without drawing the drag layer again", async () => {
    const { container, scroller } = renderList(firstPage(), MANUAL)
    await windowed(container)
    // The drag's code comes once the page is idle, and lends the rows their grips.
    await waitFor(() => expect(container.querySelector("[data-reorder-grip]")).not.toBeNull())
    const before = countFrom(container)
    for (let i = 1; i <= 10; i++) {
      act(() => {
        scroller.scrollTop = i * 400
        fireEvent.scroll(scroller)
      })
    }
    expect(cameIn(container, before), "the window moved").toBe(true)
    expect(drawn.layers, "the drag layer drawn again").toBe(0)
  })
})

// The window held (FLUIDITY-24, the J key path): the window stepped with each
// press the keys scrolled a row, and each step drew the list (rendersPerListKey
// 47.1, budget 10). It now holds the rows drawn while the screen's rows stay
// three rows inside them, and moves once they don't, as a transition.
/**
 * Presses `key` 20 times; the keys' reveal scrolls each press's row into view in its frame, as far as it must, and the
 * scroller says so. Says what each press drew, whether its row ended wholly in view, and which rows the reveals brought in.
 */
async function walk(c: HTMLElement, selection: SelectionStore, scroller: HTMLElement, key: string, shiftKey = false) {
  reveals.length = 0
  let rows = drawnTitles(c)
  const presses: { moved: boolean; renders: number; drawn: boolean; shown: boolean }[] = []
  for (let i = 1; i <= 20; i++) {
    renders.reset()
    fireEvent.keyDown(document.activeElement ?? document.body, { key, shiftKey })
    await frame()
    act(() => void fireEvent.scroll(scroller))
    const id = selection.get().highlighted
    const now = drawnTitles(c)
    const shown = inView(c, id)
    presses.push({ moved: now.size !== rows.size || [...now].some((t) => !rows.has(t)), renders: renders.count, drawn: !!id && !!c.querySelector(`[data-task-id="${id}"]`), shown })
    rows = now
  }
  return { presses, moves: presses.filter((p) => p.moved).length, hit: reveals.map((r) => r.drawn), read: reveals.map((r) => r.id), nearest: reveals.map((r) => r.nearest), top: renders.top() }
}
/** The ids from tA to tB, one step at a time. */
const ids = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => `t${a + (b >= a ? i : -i)}`)

describe("the window held as the keys go", () => {
  const firstPage = () => {
    n = 0
    return [...some(40, "backlog"), ...some(100, "todo"), ...some(100, "inProgress"), ...some(50, "inReview"), ...some(50, "done")]
  }

  it("20 J from t18 move the window at most once, and every other press draws nothing", async () => {
    const { container, selection, scroller } = renderList(firstPage())
    await windowed(container)
    act(() => selection.highlight("t18"))
    act(() => container.querySelector<HTMLElement>('[data-task-id="t18"]')!.focus())
    const down = await walk(container, selection, scroller, "j")
    expect(selection.get().highlighted).toBe("t38")
    expect(down.presses.map((p) => p.drawn), "the highlighted row drawn after each press").not.toContain(false)
    expect(down.hit, "the reveal brought in only a drawn row").not.toContain(false)
    expect(down.read, "each press's frame brought in its own row, once").toEqual(ids(19, 38))
    expect(down.nearest, "nearest both ways").not.toContain(false)
    expect(down.presses.map((p) => p.shown), "each press's row wholly in view after its frame").not.toContain(false)
    expect(down.moves, "window moves in 20 J").toBeLessThanOrEqual(1)
    expect(down.presses.filter((p) => !p.moved).map((p) => p.renders), `renders of the presses that held the window (${down.top})`).toEqual(Array(20 - down.moves).fill(0))
  })

  it("20 K back up hold it the same way", async () => {
    const { container, selection, scroller } = renderList(firstPage())
    await windowed(container)
    act(() => selection.highlight("t18"))
    act(() => container.querySelector<HTMLElement>('[data-task-id="t18"]')!.focus())
    await walk(container, selection, scroller, "j")
    const up = await walk(container, selection, scroller, "k")
    expect(selection.get().highlighted).toBe("t18")
    expect(up.presses.map((p) => p.drawn), "the highlighted row drawn after each press").not.toContain(false)
    expect(up.hit, "the reveal brought in only a drawn row").not.toContain(false)
    expect(up.read, "each press's frame brought in its own row, once").toEqual(ids(37, 18))
    expect(up.nearest, "nearest both ways").not.toContain(false)
    expect(up.presses.map((p) => p.shown), "each press's row wholly in view after its frame").not.toContain(false)
    expect(up.moves, "window moves in 20 K").toBeLessThanOrEqual(1)
    expect(up.presses.filter((p) => !p.moved).map((p) => p.renders), `renders of the presses that held the window (${up.top})`).toEqual(Array(20 - up.moves).fill(0))
  })

  it("Shift+J keeps the highlighted row drawn and moves the window at most once", async () => {
    const { container, selection, scroller } = renderList(firstPage())
    await windowed(container)
    act(() => selection.highlight("t18"))
    act(() => container.querySelector<HTMLElement>('[data-task-id="t18"]')!.focus())
    const ext = await walk(container, selection, scroller, "J", true)
    expect(selection.get().highlighted).toBe("t38")
    expect(ext.presses.map((p) => p.drawn), "the highlighted row drawn after each press").not.toContain(false)
    expect(ext.hit, "the reveal brought in only a drawn row").not.toContain(false)
    expect(ext.read, "each press's frame brought in its own row, once").toEqual(ids(19, 38))
    expect(ext.nearest, "nearest both ways").not.toContain(false)
    expect(ext.presses.map((p) => p.shown), "each press's row wholly in view after its frame").not.toContain(false)
    expect(ext.moves, "window moves in 20 Shift+J").toBeLessThanOrEqual(1)
  })
})

// One row's mount (FLUIDITY-25): a window move mounts ~13 rows, ~27 components
// each, and that was ~19.7 of the 24.9 renders per J (names run, 10 Nov). Two
// shared pieces cost a row more than they did: the priority button's Press
// (Slot, SlotClone) around a button MenuOnDemand already clones, and the
// assignee's avatar (Radix: Avatar, its Provider, a span; AvatarFallback, a
// span): 26 here before (25 in the app: this file's TaskTitle stand-in draws
// one more). A row is counted as the difference between a list of three rows
// and a list of one, so the list's own frame drops out. A row draws no
// component for a mark it would leave empty: no lock on an open task, no
// badges with nothing to count, no due label without a date (18 -> 15).
describe("one row's mount", () => {
  const ada = { user_uuid: "u-ada", user_name: "Ada Lovelace", user_email_id: "ada@example.com" }
  const assigned = (count: number) => {
    n = 0
    return some(count, "todo").map((task) => ({ ...task, task_assignee: ada }) as TaskInfoInterface)
  }
  const mount = async (count: number) => {
    renders.reset()
    const { container } = renderList(assigned(count))
    await waitFor(() => expect(container.querySelectorAll("[data-grouped-list] [data-task-id]")).toHaveLength(count))
    await act(async () => {})
    const counted = { total: renders.count, top: renders.top(40) }
    cleanup()
    vi.restoreAllMocks()
    return counted
  }

  it("draws at most 15 components for a row with a priority and an assignee, none of them a Slot, Radix's avatar or an empty mark", async () => {
    const one = await mount(1)
    const three = await mount(3)
    const row = (three.total - one.total) / 2
    expect(row, `one row's components (three rows: ${three.top}; one row: ${one.top})`).toBeLessThanOrEqual(15)
    expect(three.top, "the avatar draws as plain DOM").not.toMatch(/AvatarProvider|Primitive\.span/)
    expect(three.top, "the priority button needs no Slot").not.toMatch(/\bSlotClone\b|\bPress\b/)
    expect(three.top, "an open, undated, uncounted task draws no empty mark").not.toMatch(/\b(RestrictedMark|RowBadges|DueLabel)\b/)
  })
})
