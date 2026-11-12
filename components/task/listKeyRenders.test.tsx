import { expectJBurstDrawsNoRow } from "@/lib/testing/keysBurst"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, createEvent, fireEvent, render, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { createSelectionStore } from "@/lib/listSelection"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

// H3-d (fluid-17, FLUIDITY-18, beta 2bf8fbacf): each J drew 85.8 renders. The
// key moves the highlight and the focus from one row to the next, and each of
// the two rows drew its whole body again: its priority, check, title, dates
// and people. A row's own state draws its frame; its cells draw only for its
// task. A row's cells are counted by its title.
const drawn = vi.hoisted(() => ({ titles: [] as string[], boxes: 0 }))
// H3-c: the first X drew every row again to give it a select box (Radix's
// Checkbox, two passes each), 9,307 of the select step's 22,413 renders. The
// list says it holds a selection once, as an attribute; a row draws its box
// only while it is pointed at, focused or selected. Boxes are counted.
vi.mock("@/components/ui/checkbox", async (orig) => {
  const real = await orig<typeof import("@/components/ui/checkbox")>()
  return {
    ...real,
    Checkbox: (props: React.ComponentProps<typeof real.Checkbox>) => {
      drawn.boxes++
      return <real.Checkbox {...props} />
    },
  }
})
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
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

afterEach(() => {
  cleanup()
  drawn.titles = []
  drawn.boxes = 0
})

const tasks = Array.from({ length: 30 }, (_, i) => ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: i % 3 ? "todo" : "inProgress", task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface)
const canEdit = () => true

/** `onCommit`: told of each commit inside the list (a React.Profiler around it). */
function renderList(onCommit: () => void = () => {}) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer, split: splitSlice.reducer } })
  const selection = createSelectionStore()
  // As a project's page: the keys (hooks/useListKeyboard) over the list.
  function Page() {
    const keys = React.useRef<HTMLDivElement>(null)
    useListKeyboard({ containerRef: keys, store: selection, enabled: true })
    return (
      <ListSelectionContext.Provider value={selection}>
        <div ref={keys}>
          <React.Profiler id="list" onRender={onCommit}>
            <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={canEdit} projectId="p" />
          </React.Profiler>
        </div>
      </ListSelectionContext.Provider>
    )
  }
  const view = render(
    <Provider store={store}>
      <Page />
    </Provider>,
  )
  return { ...view, store, selection }
}

describe("the keys over a list", () => {
  it("J and K move the highlight and the focus, and draw no row's cells", () => {
    const { container } = renderList()
    const first = container.querySelector<HTMLElement>("[data-task-id]")!
    act(() => first.focus())
    drawn.titles = []
    for (const key of ["j", "j", "j", "k", "j"]) fireEvent.keyDown(document.activeElement ?? document.body, { key })
    expect(container.querySelector("[data-highlighted]"), "the keys moved").not.toBe(first)
    expect(drawn.titles).toEqual([])
  })

  it("X selects a row: no other row draws, and the list says so once", () => {
    const { container } = renderList()
    const first = container.querySelector<HTMLElement>("[data-task-id]")!
    act(() => first.focus())
    drawn.titles = []
    drawn.boxes = 0
    fireEvent.keyDown(first, { key: "x" })
    expect(first.getAttribute("data-state")).toBe("selected")
    expect(drawn.titles, "no row's cells").toEqual([])
    expect(drawn.boxes, "only the selected row's box draws").toBeLessThanOrEqual(2)
    expect(container.querySelector("[data-grouped-list]")?.hasAttribute("data-any-selected"), "the list holds a selection").toBe(true)
  })
  // A finger's tap on a computer-width list (a tablet, a touch laptop): the
  // box under it must stay the one it lands on. The touch's pointerenter made
  // the row live and swapped the empty box for the Checkbox under the finger,
  // so the tap selected nothing (e2e/taskListDraws.spec.ts at 1280 with touch).
  it("with a selection, a finger's tap on another row's box adds that row and opens nothing", () => {
    // A pointer event that carries its type (jsdom has none).
    installPointerEvent()
    const { container, store } = renderList()
    const rows = container.querySelectorAll<HTMLElement>("[data-task-id]")
    act(() => rows[0].focus())
    fireEvent.keyDown(rows[0], { key: "x" })
    const other = rows[4]
    const box = other.querySelector<HTMLElement>("span.w-4.shrink-0 > *")!
    expect(box, "the row's select slot").not.toBeNull()
    for (const type of ["pointerOver", "pointerDown", "pointerUp"] as const) fireEvent[type](box, { pointerType: "touch", isPrimary: true })
    // Then the tap's mouse events as a browser sends them: a mousedown whose default focuses the box (jsdom does
    // none), and a click on the box it pressed, which a browser drops if that box has left the page by then
    // (592c8e2ae: the focus handed on to the Checkbox, which took the box's place under the finger).
    const down = createEvent.mouseDown(box)
    fireEvent(box, down)
    if (!down.defaultPrevented) act(() => box.focus())
    expect(box.isConnected, "the pressed box is still on the page for its click").toBe(true)
    fireEvent.mouseUp(box)
    fireEvent.click(box)
    expect(other.getAttribute("data-state"), "the tapped row is selected").toBe("selected")
    expect(rows[0].getAttribute("data-state"), "the first stays selected").toBe("selected")
    expect(store.getState().rightPanel.rightPanelState.isOpen, "no task opened").toBe(false)
  })
  // A mouse that arrives on another row's box and presses at once (a quick move and click, or voice control or a
  // switch that moves the pointer and clicks together). Its arrival made the row live, which swapped the empty box
  // for the Checkbox. In a browser that swap drew inside the click: the list's own capture click (useListKeyboard's
  // store.highlight) is a sync store write, and React 19 renders a pending pointer update with a sync one, so the
  // box the click landed on left the page before the slot's onClick ran and the row was not added.
  it("with a selection, a mouse's click that arrives on another row's box with its move adds that row and opens nothing", () => {
    installPointerEvent()
    const { container, store } = renderList()
    const rows = container.querySelectorAll<HTMLElement>("[data-task-id]")
    act(() => rows[0].focus())
    fireEvent.keyDown(rows[0], { key: "x" })
    const other = rows[4]
    const box = other.querySelector<HTMLElement>("span.w-4.shrink-0 > *")!
    expect(box, "the row's select slot").not.toBeNull()
    // The move's arrival, drawn here before the click (a browser draws it inside the click).
    for (const type of ["pointerOver", "pointerMove"] as const) fireEvent[type](box, { pointerType: "mouse", isPrimary: true })
    expect(box.isConnected, "the box the pointer arrived on is still on the page for its click").toBe(true)
    fireEvent.pointerDown(box, { pointerType: "mouse", isPrimary: true })
    fireEvent.mouseDown(box)
    fireEvent.pointerUp(box, { pointerType: "mouse", isPrimary: true })
    fireEvent.mouseUp(box)
    fireEvent.click(box)
    expect(other.getAttribute("data-state"), "the clicked row is selected").toBe("selected")
    expect(rows[0].getAttribute("data-state"), "the first stays selected").toBe("selected")
    expect(store.getState().rightPanel.rightPanelState.isOpen, "no task opened").toBe(false)
  })
})

// H3-c drew the empty box beside an unfocused row as an aria-hidden span, so
// while a list held a selection a screen reader met "Select <task>" on the
// focused row only; before H3-c every row's Checkbox was in the tree. The
// empty box is a real control again: a light native box with the row's name.
// The list draws at a computer's width (keys) and a tablet's (a finger); the
// selection comes from either.
describe("a screen reader over a list that holds a selection", () => {
  it.each<[string, (rows: NodeListOf<HTMLElement>) => void]>([
    ["the keys", (rows: NodeListOf<HTMLElement>) => fireEvent.keyDown(rows[0], { key: "x" })],
    ["a finger", (rows: NodeListOf<HTMLElement>) => {
      fireEvent.keyDown(rows[0], { key: "x" })
      const box = rows[3].querySelector<HTMLElement>("[data-row-select] > *")!
      for (const type of ["pointerOver", "pointerDown", "pointerUp"] as const) fireEvent[type](box, { pointerType: "touch", isPrimary: true })
      fireEvent.click(box)
    }],
  ])("finds every drawn row's select box by its name, picked by %s", (_, pick) => {
    installPointerEvent()
    const { container } = renderList()
    const rows = container.querySelectorAll<HTMLElement>("[data-task-id]")
    act(() => rows[0].focus())
    pick(rows)
    act(() => rows[0].blur())
    expect(rows.length, "the rows drawn").toBe(tasks.length)
    for (const row of rows) {
      const task = tasks.find((t) => t.task_uuid === row.getAttribute("data-task-id"))!
      const box = within(row).queryByRole("checkbox", { name: `Select ${task.task_name}` })
      expect(box, `${task.task_name}'s box`).not.toBeNull()
      expect(box?.getAttribute("aria-checked"), `${task.task_name}'s box says whether it is picked`).toBe(row.getAttribute("data-state") === "selected" ? "true" : "false")
    }
  })

  // A screen reader's cursor on a light box focuses it; the row's Checkbox takes its place and the focus with it.
  it("keeps the focus on a box as the Checkbox takes the light box's place", () => {
    const { container } = renderList()
    const rows = container.querySelectorAll<HTMLElement>("[data-task-id]")
    act(() => rows[0].focus())
    fireEvent.keyDown(rows[0], { key: "x" })
    const light = rows[5].querySelector<HTMLElement>("[data-row-box]")!
    act(() => light.focus())
    const focused = document.activeElement as HTMLElement
    expect(focused.getAttribute("role"), "a box has the focus").toBe("checkbox")
    expect(focused.hasAttribute("data-row-box"), "the Checkbox, not the light box").toBe(false)
    expect(rows[5].contains(focused), "the same row's").toBe(true)
  })
})

// The keys' place is painted, not rendered (FLUIDITY-24, 9 Nov 2026): each J
// drew 47.1 renders on a project's list (bt7). The row the highlight left and
// the row it reached drew their frames for it, and the focus that follows the
// highlight mounted a Checkbox in the new row and unmounted the old one's
// (24.5 of the 47.1), a box a mouse's screen doesn't even show. The highlight
// is an attribute the hook that moves it paints (hooks/useListKeyboard), and
// the row's own focus is no state: only what rests on the place draws.
/** Where a browser's Tab goes from the focus, when nothing on the page takes the key: jsdom moves no focus for it. */
function tab(back = false) {
  const from = document.activeElement as HTMLElement
  if (!fireEvent.keyDown(from, { key: "Tab", shiftKey: back })) return
  const reach = Array.from(document.querySelectorAll<HTMLElement>("button,input,a[href],[tabindex]")).filter((el) => el.tabIndex >= 0 && !el.hasAttribute("disabled"))
  const next = back ? reach.reverse().find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) : reach.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
  act(() => next?.focus())
}
/** What a screen reader and the Tab key read off a row and its select box: as before the paint. */
function a11yOf(row: HTMLElement) {
  const boxes = Array.from(row.querySelectorAll<HTMLElement>("[role=checkbox]"))
  return {
    role: row.getAttribute("role"),
    tabIndex: row.tabIndex,
    current: row.getAttribute("aria-current"),
    selected: row.getAttribute("aria-selected"),
    boxes: boxes.map((b) => ({ role: b.getAttribute("role"), name: b.getAttribute("aria-label"), checked: b.getAttribute("aria-checked"), tabIndex: b.tabIndex })),
  }
}
/** Before the paint the row that held the focus drew the Checkbox (Tab's stop, 0); every other row's box -1. */
const asBefore = (row: HTMLElement) => ({
  role: "listitem",
  tabIndex: -1,
  current: null,
  selected: null,
  boxes: [{ role: "checkbox", name: `Select Task ${row.getAttribute("data-task-id")?.slice(1)}`, checked: "false", tabIndex: row.contains(document.activeElement) ? 0 : -1 }],
})

describe("the keys' place, painted", () => {
  it("five J commit nothing in the list and mount no box; the new row is lit and has the focus, and Tab lands on its select box", () => {
    let commits = 0
    const { container, selection } = renderList(() => commits++)
    const first = container.querySelector<HTMLElement>("[data-task-id]")!
    act(() => first.focus())
    commits = 0
    drawn.boxes = 0
    drawn.titles = []
    for (let i = 0; i < 5; i++) fireEvent.keyDown(document.activeElement ?? document.body, { key: "j" })
    expect(commits, "commits inside the list").toBe(0)
    expect(drawn.boxes, "Checkboxes mounted").toBe(0)
    expect(drawn.titles, "rows' cells drawn").toEqual([])
    const lit = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id][data-highlighted]"))
    expect(lit.map((r) => r.getAttribute("data-task-id")), "one row lit, the store's").toEqual([selection.get().highlighted])
    expect(lit[0]).not.toBe(first)
    expect(document.activeElement, "the focus is on the lit row").toBe(lit[0])
    for (const row of container.querySelectorAll<HTMLElement>("[data-task-id]")) expect(a11yOf(row)).toEqual(asBefore(row))
    tab()
    const focused = document.activeElement as HTMLElement
    expect(focused.getAttribute("role"), "Tab from the row lands on its select box").toBe("checkbox")
    expect(focused.getAttribute("aria-label")).toBe(`Select Task ${lit[0].getAttribute("data-task-id")?.slice(1)}`)
    expect(lit[0].contains(focused)).toBe(true)
    for (const row of container.querySelectorAll<HTMLElement>("[data-task-id]")) expect(a11yOf(row)).toEqual(asBefore(row))
    tab()
    expect(document.activeElement, "Tab moves on from the box").not.toBe(focused)
    tab(true)
    const back = document.activeElement as HTMLElement
    expect(back.getAttribute("role"), "Shift+Tab from the next control lands back on the box").toBe("checkbox")
    expect(back.getAttribute("aria-label")).toBe(focused.getAttribute("aria-label"))
  })

  it("the row the focus leaves gives its box's Tab stop to the row it lands on", () => {
    const { container } = renderList()
    const [a, b] = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id]"))
    act(() => a.focus())
    fireEvent.keyDown(a, { key: "j" })
    expect(document.activeElement).toBe(b)
    const stops = () => Array.from(container.querySelectorAll<HTMLElement>("[role=checkbox]"), (box) => box.tabIndex)
    expect(stops().filter((t) => t === 0), "one Tab stop among the boxes").toHaveLength(1)
    expect(a11yOf(b)).toEqual(asBefore(b))
    expect(a11yOf(a)).toEqual(asBefore(a))
    act(() => b.blur())
    expect(stops().filter((t) => t === 0), "none once the focus leaves the list").toHaveLength(0)
  })
})

describe("the J key path on the project list", () => {
  it("a burst of J draws no row and lights one, the store's", () => {
    const { container, selection } = renderList()
    act(() => container.querySelector<HTMLElement>("[data-task-id]")!.focus())
    // memo(function TaskRow) bound to TaskRow draws as "TaskRow2" in the test bundle (lib/testing/reactRenders).
    expectJBurstDrawsNoRow({ container, store: () => selection, rows: ["TaskRow2"] })
  })
})
