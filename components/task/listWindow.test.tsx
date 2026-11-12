import * as React from "react"
import { readFileSync } from "node:fs"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice, { closeRightPanel, openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { createSelectionStore } from "@/lib/listSelection"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { listNavIn } from "@/lib/ui/listNav"
import type { TaskInfoInterface } from "@/types/task"

// A long list draws only near the screen (the windowing scope, 21 Oct 2026):
// at 2,000 tasks the project list drew 2,000 rows (55,527 elements on the
// page). Now it draws the window and the rows it keeps (the opened one here),
// pads the rest, and says how many rows each group shows. jsdom lays nothing
// out, so the window here is the virtualizer's first rect, as on a first frame.

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS, ROW_H, GROUP_H } = await import("@/components/task/GroupedTaskList")

afterEach(cleanup)
// The window comes as a chunk, fetched as a list passes 200 tasks: here, fetched first, as a page has long since.
beforeAll(async () => {
  await import("@/components/task/listWindow")
})

const t = (i: number, status = "todo") =>
  ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: status, task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface

/** The most a window draws in jsdom: its first rect (800 px, 20 rows) with the overscan both ways, and a little room. */
const WINDOW_MOST = 50

function renderList(tasks: TaskInfoInterface[]) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer, split: splitSlice.reducer } })
  const selection = createSelectionStore()
  // As a project's page: the keys (hooks/useListKeyboard) over the list, in the page's scroller.
  function Page() {
    const scroller = React.useRef<HTMLDivElement>(null)
    const keys = React.useRef<HTMLDivElement>(null)
    useListKeyboard({ containerRef: keys, store: selection, enabled: true })
    return (
      <div data-split-view="-1">
        <ListSelectionContext.Provider value={selection}>
          <div ref={scroller} data-list-scroller="" style={{ overflowY: "auto", height: 800 }}>
            <div ref={keys}>
              <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" />
            </div>
          </div>
        </ListSelectionContext.Provider>
      </div>
    )
  }
  return { store, selection, ...render(<Provider store={store}><Page /></Provider>) }
}

const drawnRows = (c: HTMLElement) => c.querySelectorAll("[data-grouped-list] [data-task-id]")

describe("a long list, windowed", () => {
  it("draws the rows near the screen at 2,000 tasks, never all of them, and says how many it shows", async () => {
    const { container } = renderList(Array.from({ length: 2000 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 1940 more" }))
    await waitFor(() => expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST))
    expect(drawnRows(container).length).toBeGreaterThan(10)
    const list = container.querySelector<HTMLElement>("[data-group='todo'] > [role=list]")!
    expect(list.getAttribute("data-rows")).toBe("2000")
    // The rows not drawn are the list's padding, so the page is as tall as before.
    expect(parseFloat(list.style.paddingBottom)).toBeGreaterThan(1900 * 40)
    const first = drawnRows(container)[0]
    expect(first.getAttribute("aria-setsize")).toBe("2000")
    expect(first.getAttribute("aria-posinset")).toBe("1")
  })

  it("keeps the opened task's row drawn wherever the window is, the space above it as its margin", async () => {
    const { container, store } = renderList(Array.from({ length: 2000 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 1940 more" }))
    act(() => void store.dispatch(openRightPanel({ taskUUID: "t1500" })))
    await waitFor(() => expect(container.querySelector("[data-task-id='t1500']")).not.toBeNull())
    const row = container.querySelector<HTMLElement>("[data-task-id='t1500']")!
    expect(parseFloat(row.style.marginTop)).toBeGreaterThan(1000 * 40)
    expect(row.getAttribute("aria-posinset")).toBe("1501")
    expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST + 1)
  })

  it("steps J past the rows drawn, in the list's own order, and Shift+J runs over rows not drawn", async () => {
    const { container, selection } = renderList(Array.from({ length: 2000 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 1940 more" }))
    await waitFor(() => expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST))
    const rows = drawnRows(container)
    const last = Number(rows[rows.length - 1].getAttribute("aria-posinset")) - 1
    act(() => selection.highlight(`t${last}`))
    // The next row isn't drawn (jsdom can't scroll the window to it): J still goes there, by the list's order.
    fireEvent.keyDown(document.body, { key: "j" })
    expect(selection.get().highlighted).toBe(`t${last + 1}`)
    fireEvent.keyDown(document.body, { key: "J", shiftKey: true })
    expect(selection.get().highlighted).toBe(`t${last + 2}`)
    expect([...selection.get().selected].sort()).toEqual([`t${last + 1}`, `t${last + 2}`].sort())
  })

  it("leaves the focus on the row the last key went to, though a row an earlier key went to is drawn later", async () => {
    // e2e/listWindow.spec (22 Oct 2026): J pressed three times from the last row drawn. The first J's row wasn't
    // drawn, so it was to be focused once drawn; the third J's row was drawn, and focused at once. The window then
    // drew the first one, and the focus went back to it.
    const { container, store } = renderList(Array.from({ length: 2000 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 1940 more" }))
    await waitFor(() => expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST))
    const nav = listNavIn(container)!
    act(() => nav.reveal("t1500"))
    act(() => nav.reveal("t3"))
    expect(document.activeElement?.getAttribute("data-task-id")).toBe("t3")
    // t1500 is drawn (the panel's task), and the window plans again.
    act(() => void store.dispatch(openRightPanel({ taskUUID: "t1500" })))
    await waitFor(() => expect(container.querySelector("[data-task-id='t1500']")).not.toBeNull())
    act(() => void store.dispatch(closeRightPanel()))
    expect(document.activeElement?.getAttribute("data-task-id")).toBe("t3")
  })

  it("keeps a held section's header drawn, as it keeps the rows a drag holds", async () => {
    // B-2's section drag (agreed with B2-WEB-2, 22 Oct 2026): the lifted header carries data-reorder-held, as a held row does.
    const { keptKeys } = await import("@/components/task/listWindow")
    const list = document.createElement("div")
    list.innerHTML = '<section data-group="todo"><div data-group-header="" data-reorder-held=""></div><div role="list"><div data-task-id="t1" data-reorder-held=""></div><div data-task-id="t2"></div></div></section>'
    document.body.append(list)
    expect(keptKeys(list).sort()).toEqual(["t1", "todo#head"])
    list.remove()
  })

  it("draws every row of a list under 200, so the page's find still finds them", () => {
    const tasks = [...Array.from({ length: 50 }, (_, i) => t(i, "todo")), ...Array.from({ length: 50 }, (_, i) => t(100 + i, "inProgress")), ...Array.from({ length: 50 }, (_, i) => t(200 + i, "backlog"))]
    const { container } = renderList(tasks)
    expect(drawnRows(container)).toHaveLength(150)
    expect(container.querySelector("[role=list][data-rows]")).toBeNull()
  })
})

// What a window keeps drawn is read from the page each time it moves (CR-B48, 8 Nov): the focused row, a row whose
// menu is open, and a key's row once it is drawn. jsdom lays nothing out, so here the page's scroller is 800 px tall
// and scrolled where the test puts it, as in listWindowRenders.test; a scroller's scrollTo moves it and says so.
function layOutScroller() {
  const tops = new WeakMap<Element, number>()
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute("data-list-scroller") ? 800 : 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    return tops.get(this) ?? 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, v: number) {
    tops.set(this, v)
  })
  const scrollTo = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTo")
  Object.defineProperty(Element.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value(this: Element, to: ScrollToOptions) {
      if (typeof to?.top !== "number") return
      this.scrollTop = to.top
      this.dispatchEvent(new Event("scroll"))
    },
  })
  return () => (scrollTo ? Object.defineProperty(Element.prototype, "scrollTo", scrollTo) : Reflect.deleteProperty(Element.prototype, "scrollTo"))
}

describe("a moving window", () => {
  let unlay = () => {}
  afterEach(() => {
    unlay()
    vi.restoreAllMocks()
  })

  async function longList() {
    unlay = layOutScroller()
    const view = renderList(Array.from({ length: 2000 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 1940 more" }))
    await waitFor(() => expect(drawnRows(view.container).length).toBeLessThanOrEqual(WINDOW_MOST))
    const scroller = view.container.querySelector<HTMLElement>("[data-list-scroller]")!
    /** The wheel takes the window to a row far below. */
    const scrollTo = async (row: number) => {
      act(() => {
        scroller.scrollTop = row * 40
        fireEvent.scroll(scroller)
      })
      await waitFor(() => expect(view.container.querySelector(`[data-task-id='t${row}']`)).not.toBeNull())
    }
    return { ...view, scroller, scrollTo }
  }
  const row = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-task-id='${id}']`)
  /**
   * Where a drawn row sits in its group's list, as the list draws it: the list's top padding (the space before its
   * first drawn row), then each drawn row's gap (the space since the row drawn before it) and its 40 px.
   */
  const placeInList = (r: HTMLElement) => {
    const list = r.closest<HTMLElement>("[role=list]")!
    let y = parseFloat(list.style.paddingTop) || 0
    for (const d of Array.from(list.querySelectorAll<HTMLElement>("[role=listitem][data-task-id]"))) {
      y += parseFloat(d.style.marginTop) || 0
      if (d === r) return y
      y += 40
    }
    return NaN
  }

  it("keeps the focused row drawn, with its gap, and its focus, when the window moves past it", async () => {
    const { container, scrollTo } = await longList()
    const focused = row(container, "t5")!
    act(() => focused.focus())
    await scrollTo(1000)
    expect(row(container, "t5")).toBe(focused)
    expect(document.activeElement).toBe(focused)
    // The kept row sits at its own place, and the window's rows below it at theirs, past the gap between them.
    expect(placeInList(focused)).toBe(5 * 40)
    expect(placeInList(row(container, "t1000")!)).toBe(1000 * 40)
    expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST + 1)
  })

  it("keeps a row drawn under its open status menu when the window moves past it", async () => {
    const { container, scrollTo } = await longList()
    fireEvent.click(screen.getByRole("button", { name: "Mark Task 5 complete" }), { altKey: true })
    await waitFor(() => expect(row(container, "t5")!.querySelector('[aria-expanded="true"]')).not.toBeNull())
    expect(row(container, "t5")!.contains(document.activeElement)).toBe(false)
    await scrollTo(1000)
    expect(row(container, "t5")!.querySelector('[aria-expanded="true"]')).not.toBeNull()
    expect(drawnRows(container).length).toBeLessThanOrEqual(WINDOW_MOST + 1)
  })

  it("scrolls to a row J goes to before it is drawn, and focuses it once it is", async () => {
    const { container, selection, scroller } = await longList()
    const rows = drawnRows(container)
    const last = Number(rows[rows.length - 1].getAttribute("aria-posinset")) - 1
    act(() => selection.highlight(`t${last}`))
    expect(row(container, `t${last + 1}`)).toBeNull()
    fireEvent.keyDown(document.body, { key: "j" })
    await waitFor(() => expect(document.activeElement?.getAttribute("data-task-id")).toBe(`t${last + 1}`))
    expect(scroller.scrollTop).toBeGreaterThan(0)
  })
})

// The window lays a list out by its items' heights (listWindow's PX), and the
// list draws its rows and group heads by GroupedTaskList's classes. PX repeats
// them as numbers, since the window's chunk doesn't import the list: out of
// step, the window draws the rows it thinks are near the screen, not the ones
// that are.
describe("the window's sizes", () => {
  it("are the list's own: a row's, a group head's, Show N more's, the + field's and the all-clear line's, in px", () => {
    const px = Object.fromEntries(
      [...(/const PX = \{([^}]*)\}/.exec(readFileSync("components/task/listWindow.tsx", "utf8"))?.[1] ?? "").matchAll(/(\w+): (\d+)/g)].map((m) => [m[1], Number(m[2])]),
    )
    // Tailwind's spacing: 4px a step.
    const tall = (cls: string) => Number(/^h-(\d+)$/.exec(cls)?.[1]) * 4
    expect(px.row).toBe(tall(ROW_H))
    expect(px.header).toBe(tall(GROUP_H))
    // The rest by the list's own classes: "Show N more", the "+" field (InlineAdd, a row's height) and the all-clear line.
    const list = readFileSync("components/task/GroupedTaskList.tsx", "utf8")
    expect(px.more).toBe(tall(/className="[^"]*\b(h-\d+)\b[^"]*"\s*>\s*Show \{hidden\} more/.exec(list)?.[1] ?? ""))
    expect(/function InlineAdd[\s\S]*?className=\{cn\((\w+),/.exec(list)?.[1]).toBe("ROW_H")
    expect(px.add).toBe(tall(ROW_H))
    expect(px.empty).toBe(tall(/data-all-clear="" className="[^"]*\b(h-\d+)\b/.exec(list)?.[1] ?? ""))
  })
})

// The window is a lazy part (lib/lazy/lazyPart): its chunk takes nothing from
// the shared core, which would cut the core's chunks anew. The opened task
// comes from the list as a prop, not from the store.
describe("the window's part", () => {
  it("imports no store at run time: no react-redux, nothing from @/store", () => {
    const src = readFileSync("components/task/listWindow.tsx", "utf8")
    const runtime = [...src.matchAll(/^import (?!type )[^\n]* from "([^"]+)"/gm)].map((m) => m[1])
    expect(runtime.filter((m) => m === "react-redux" || m.startsWith("@/store"))).toEqual([])
  })
})
