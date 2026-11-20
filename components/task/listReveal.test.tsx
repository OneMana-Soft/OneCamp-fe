import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { flushSync } from "react-dom"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { createSelectionStore } from "@/lib/listSelection"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { sourceFiles } from "@/lib/testing/sourceFiles"
import type { TaskInfoInterface } from "@/types/task"

// fluid-17 part 2 (FLUIDITY-27, PLAN-P2): each J cost ~13.6 ms, 8.3 ms of it three
// style recalcs the key forced: the reveal's scrollIntoView read the page's layout
// right after the key lit its row, and focus() restyled again; and as the rows'
// marks (the keys' cursor, the select box's ring) were group variants read
// against every element under a row, each recalc restyled both rows' subtrees
// (~266 elements per J). A key now reads nothing: it focuses its row once, with
// no scroll, and the row is brought into view in the frame, by scrollIntoView
// ("nearest" both ways), which scrolls only when it is not wholly in view. The
// marks are read from the row's own state by its children alone.

vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

// The window comes as a chunk, fetched as a list passes 200 tasks: here, fetched first, as a page has long since.
beforeAll(async () => {
  await import("@/components/task/listWindow")
})

const t = (i: number) =>
  ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: "todo", task_priority: "medium", task_label: "", task_due_date: "" }) as TaskInfoInterface

/** The list's head (its group's 36 px header) above its first row, and a row's 40 px, as the page lays them out here. */
const HEAD = 36
const ROW = 40

/**
 * jsdom lays nothing out: here the page's scroller is `height` px tall at the top of the screen, and a row sits at
 * HEAD + its place x ROW less the scroller's scrollTop. Every read of the page's layout is counted, and so are the
 * writes to a scroller's scrollTop (a write scrolls, as a browser's does, and says so) and the scrollIntoView calls.
 */
function layOut(height: number) {
  const tops = new WeakMap<Element, number>()
  const seen = { reads: 0, inKey: false, keyReads: 0, writes: [] as Array<{ to: number; inKey: boolean }>, intos: [] as Array<{ id: string | null; arg: unknown; inKey: boolean }> }
  const read = () => {
    seen.reads++
    if (seen.inKey) seen.keyReads++
  }
  const isScroller = (el: Element) => el.hasAttribute("data-list-scroller")
  const place = (el: Element) => Number(el.getAttribute("aria-posinset") ?? Number(el.getAttribute("data-task-id")!.slice(1)) + 1) - 1
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    read()
    const box = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 1000, width: 1000, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    if (isScroller(this)) return box(0, height)
    if (this.hasAttribute("data-task-id")) {
      const scroller = this.closest("[data-list-scroller]")!
      return box(HEAD + place(this) * ROW - (tops.get(scroller) ?? 0), ROW)
    }
    return box(0, 0)
  })
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    read()
    return isScroller(this) ? height : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    read()
    return this.hasAttribute("data-task-id") ? HEAD + place(this) * ROW : 0
  })
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (this: Element) {
    read()
    return isScroller(this) ? height : 0
  })
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    read()
    return isScroller(this) ? 1_000_000 : 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    return tops.get(this) ?? 0
  })
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (this: Element, v: number) {
    seen.writes.push({ to: v, inKey: seen.inKey })
    tops.set(this, v)
    this.dispatchEvent(new Event("scroll"))
  })
  // The browser's scrollIntoView({ block: "nearest" }) on this page's one scroller: by as little as shows the row
  // wholly, and only when it is not. Each call is kept: on which row, with what, and in the key or in its frame.
  const into = vi.fn(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
    seen.intos.push({ id: this.getAttribute("data-task-id"), arg, inKey: seen.inKey })
    const scroller = this.closest("[data-list-scroller]")
    if (!scroller || !this.hasAttribute("data-task-id")) return
    const was = tops.get(scroller) ?? 0
    const start = HEAD + place(this) * ROW
    const to = start < was ? start : start + ROW > was + height ? start + ROW - height : was
    if (to !== was) scroller.scrollTop = to
  })
  const hadInto = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView")
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: into })
  const focus = vi.spyOn(HTMLElement.prototype, "focus")
  const undo = () => {
    if (hadInto) Object.defineProperty(Element.prototype, "scrollIntoView", hadInto)
  }
  return { seen, into, focus, undo, top: (el: Element) => tops.get(el) ?? 0 }
}

/** `onCommit`: told of each React commit anywhere on the page (a Profiler around it). */
function renderList(tasks: TaskInfoInterface[], onCommit: () => void = () => {}) {
  const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer, split: splitSlice.reducer } })
  const selection = createSelectionStore()
  // As a project's page: the keys (hooks/useListKeyboard) over the list, in the page's scroller.
  function Page() {
    const keys = React.useRef<HTMLDivElement>(null)
    useListKeyboard({ containerRef: keys, store: selection, enabled: true })
    return (
      <div data-split-view="-1">
        <ListSelectionContext.Provider value={selection}>
          <div data-list-scroller="" style={{ overflowY: "auto" }}>
            <div ref={keys}>
              <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={() => true} projectId="p" />
            </div>
          </div>
        </ListSelectionContext.Provider>
      </div>
    )
  }
  return { selection, ...render(<Provider store={store}><React.Profiler id="page" onRender={() => onCommit()}><Page /></React.Profiler></Provider>) }
}

const drawnRows = (c: HTMLElement) => c.querySelectorAll("[data-grouped-list] [data-task-id]")
const row = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-task-id='${id}']`)
/** The frame after a key: what a browser runs before it paints. */
const frame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())))

/**
 * Presses `key` `times` times from where the list's keys are, and says per press: the layout reads, scrollIntoView
 * calls and focus() calls inside the key's task, the scrollTop writes that came of it (in the key and in its frame),
 * and the row it went to.
 */
async function press(c: HTMLElement, lay: ReturnType<typeof layOut>, scroller: HTMLElement, key: string, times: number) {
  const out: Array<{ id: string | null; keyReads: number; into: number; framed: Array<[string | null, unknown]>; focus: unknown[][]; writes: Array<{ to: number; inKey: boolean }>; before: number }> = []
  for (let i = 0; i < times; i++) {
    lay.into.mockClear()
    lay.focus.mockClear()
    lay.seen.keyReads = 0
    lay.seen.writes = []
    lay.seen.intos = []
    const before = lay.top(scroller)
    lay.seen.inKey = true
    fireEvent.keyDown(document.activeElement ?? document.body, { key })
    lay.seen.inKey = false
    const into = lay.into.mock.calls.length
    const keyReads = lay.seen.keyReads
    await frame()
    const framed = lay.seen.intos.filter((c) => !c.inKey).map((c): [string | null, unknown] => [c.id, c.arg])
    out.push({ id: document.activeElement?.getAttribute("data-task-id") ?? null, keyReads, into, framed, focus: lay.focus.mock.calls.map((a) => a), writes: lay.seen.writes, before })
  }
  return out
}

/** Where scrollIntoView({ block: "nearest" }) leaves a `height` px scroller's scrollTop for the row at `place`, from `top`. */
function nearest(place: number, top: number, height: number) {
  const start = HEAD + place * ROW
  const end = start + ROW
  if (start < top) return start
  if (end > top + height) return end - height
  return top
}

/** Each press's own checks: nothing read and nothing scrolled in the key, one focus with no scroll, one scrollIntoView in its frame, and a scroll only when the row left the view. */
function expectRevealsReadNothing(presses: Awaited<ReturnType<typeof press>>, height: number, from: number, step: number) {
  presses.forEach((p, i) => {
    const place = from + step * (i + 1)
    const at = `press ${i + 1} (to t${place})`
    expect(p.id, at).toBe(`t${place}`)
    expect(p.into, `${at}: scrollIntoView calls in the key`).toBe(0)
    expect(p.keyReads, `${at}: layout reads in the key`).toBe(0)
    expect(p.focus, `${at}: focus() calls`).toEqual([[{ preventScroll: true }]])
    expect(p.writes.filter((w) => w.inKey), `${at}: scrollTop written in the key`).toEqual([])
    expect(p.framed, `${at}: scrollIntoView in its frame, once, on its row, nearest both ways`).toEqual([[`t${place}`, { block: "nearest", inline: "nearest" }]])
    const want = nearest(place, p.before, height)
    // Written only when the row left the view, and then to where "nearest" would leave it: wholly in view, at the edge it went past.
    expect(p.writes.map((w) => w.to), `${at}: scrollTop written in its frame (from ${p.before})`).toEqual(want === p.before ? [] : [want])
  })
}

describe("a key's reveal reads nothing in the key", () => {
  let lay: ReturnType<typeof layOut> | null = null
  afterEach(() => {
    lay?.undo()
    lay = null
    vi.restoreAllMocks()
    cleanup()
  })

  it("on a windowed list of 640 rows: 20 J then 20 K, each one focus with no scroll, no layout read, and a scroll only past the view's edge", async () => {
    lay = layOut(800)
    const { container, selection } = renderList(Array.from({ length: 640 }, (_, i) => t(i)))
    fireEvent.click(screen.getByRole("button", { name: "Show 580 more" }))
    await waitFor(() => expect(drawnRows(container).length).toBeLessThan(100))
    const scroller = container.querySelector<HTMLElement>("[data-list-scroller]")!
    expect(row(container, "t0")).not.toBeNull()
    act(() => selection.highlight("t0"))
    act(() => row(container, "t0")!.focus())
    const down = await press(container, lay, scroller, "j", 20)
    expectRevealsReadNothing(down, 800, 0, 1)
    // The rows past the view's bottom edge scrolled it: t19 (796 to 836) is the first.
    expect(down.flatMap((p) => p.writes).length).toBeGreaterThan(0)
    const up = await press(container, lay, scroller, "k", 20)
    expectRevealsReadNothing(up, 800, 20, -1)
    expect(lay.top(scroller), "back at the top, the list scrolled to its first row's top").toBe(HEAD)
  })

  it("on a list drawn whole (no window), through the keys' own reveal: the same", async () => {
    lay = layOut(400)
    const { container, selection } = renderList(Array.from({ length: 30 }, (_, i) => t(i)))
    const scroller = container.querySelector<HTMLElement>("[data-list-scroller]")!
    expect(drawnRows(container)).toHaveLength(30)
    act(() => selection.highlight("t0"))
    act(() => row(container, "t0")!.focus())
    const down = await press(container, lay, scroller, "j", 20)
    expectRevealsReadNothing(down, 400, 0, 1)
    expect(down.filter((p) => p.writes.length).length, "a scroll for each row past the bottom edge: t9 to t20").toBe(12)
    const up = await press(container, lay, scroller, "k", 20)
    expectRevealsReadNothing(up, 400, 20, -1)
  })
})

// fluid-17 part 2, last step (FLUIDITY-28): inside a key's focus() Blink restyles twice on its own (the row the focus
// leaves, after blur; the row it lands on, before the focus event), and a third time, with a layout, for what the
// list's focus listeners wrote meanwhile (the select box's Tab stop, the keys' place). Those writes now wait until the
// key's focus() returns (lib/ui/listNav afterFocus), so focus finds nothing of ours to restyle; a mouse's or Tab's
// focus writes at once, as before.

/** Each focus() call's DOM mutations and React commits, taken synchronously around the real call. */
function watchFocus(root: HTMLElement, commits: { n: number }) {
  const prev = HTMLElement.prototype.focus
  const seen = { calls: 0, mutations: [] as string[], renders: 0 }
  const mo = new MutationObserver(() => {})
  mo.observe(root, { subtree: true, attributes: true, childList: true, characterData: true })
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    // What the key wrote and scheduled before its focus is not the focus's.
    flushSync(() => {})
    mo.takeRecords()
    const before = commits.n
    // flushSync: a React update the focus's listeners scheduled is drawn inside the call, so it is counted.
    flushSync(() => prev.call(this, options))
    seen.renders += commits.n - before
    for (const r of mo.takeRecords()) seen.mutations.push(`${r.type} ${r.attributeName ?? ""} on ${(r.target as Element).closest?.("[data-task-id]")?.getAttribute("data-task-id") ?? (r.target as Element).nodeName}`)
    seen.calls++
  }
  return { seen, undo: () => { HTMLElement.prototype.focus = prev; mo.disconnect() } }
}

/** The light boxes that are Tab's stop, by their row. */
const stops = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-row-box][tabindex="0"]'), (b) => b.closest("[data-task-id]")?.getAttribute("data-task-id"))
const lit = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>("[data-task-id][data-highlighted]"), (r) => r.getAttribute("data-task-id"))

/** J and K from t0: no DOM write and no render inside any key's focus(); right after each key (no frame) the focused row is lit and holds the one Tab stop. */
async function expectFocusWritesNothing(c: HTMLElement, commits: { n: number }, keys: string[]) {
  const w = watchFocus(c, commits)
  try {
    for (const key of keys) {
      fireEvent.keyDown(document.activeElement ?? document.body, { key })
      const at = document.activeElement?.getAttribute("data-task-id")
      expect(lit(c), `after ${key}: the focused row is the lit one`).toEqual([at])
      expect(stops(c), `after ${key}, before its frame: Tab's stop is on the focused row's box, and only there`).toEqual([at])
      await frame()
    }
  } finally {
    w.undo()
  }
  expect(w.seen.calls, "one focus() per key").toBe(keys.length)
  expect(w.seen.mutations, "DOM writes inside the keys' focus() calls").toEqual([])
  expect(w.seen.renders, "React commits inside the keys' focus() calls").toBe(0)
}

describe("a key's focus writes nothing while it runs", () => {
  let lay: ReturnType<typeof layOut> | null = null
  afterEach(() => {
    lay?.undo()
    lay = null
    vi.restoreAllMocks()
    cleanup()
  })

  it("on a windowed list of 640 rows: J and K", async () => {
    lay = layOut(800)
    const commits = { n: 0 }
    const { container, selection } = renderList(Array.from({ length: 640 }, (_, i) => t(i)), () => commits.n++)
    fireEvent.click(screen.getByRole("button", { name: "Show 580 more" }))
    await waitFor(() => expect(drawnRows(container).length).toBeLessThan(100))
    act(() => selection.highlight("t0"))
    act(() => row(container, "t0")!.focus())
    await frame()
    await expectFocusWritesNothing(container, commits, ["j", "j", "j", "j", "j", "k", "k", "j"])
    expect(document.activeElement?.getAttribute("data-task-id")).toBe("t4")
  })

  it("on a list drawn whole (no window): J and K", async () => {
    lay = layOut(400)
    const commits = { n: 0 }
    const { container, selection } = renderList(Array.from({ length: 30 }, (_, i) => t(i)), () => commits.n++)
    act(() => selection.highlight("t0"))
    act(() => row(container, "t0")!.focus())
    await frame()
    await expectFocusWritesNothing(container, commits, ["j", "j", "j", "k", "j", "j"])
    expect(document.activeElement?.getAttribute("data-task-id")).toBe("t4")
  })

  it("a mouse's or Tab's focus on a row still lights it and gives its box Tab's stop, at once", async () => {
    const { container } = renderList(Array.from({ length: 30 }, (_, i) => t(i)))
    act(() => row(container, "t3")!.focus())
    expect(lit(container), "focused by a click: lit").toEqual(["t3"])
    expect(stops(container), "and its box is Tab's stop, the only one").toEqual(["t3"])
    act(() => row(container, "t7")!.focus())
    expect(lit(container)).toEqual(["t7"])
    expect(stops(container)).toEqual(["t7"])
    act(() => (document.activeElement as HTMLElement).blur())
    expect(stops(container), "none once the focus leaves the list").toEqual([])
    // Tab onto a row's select box: the row is lit at once, and no other row's box is Tab's stop.
    act(() => row(container, "t5")!.querySelector<HTMLElement>("[data-row-box]")!.focus())
    expect(lit(container)).toEqual(["t5"])
    expect(document.activeElement?.closest("[data-task-id]")?.getAttribute("data-task-id")).toBe("t5")
    expect(stops(container).filter((id) => id !== "t5")).toEqual([])
  })

  it("Tab right after a J, with no frame between: the J's row's box is Tab's stop, and Tab lands on it", async () => {
    lay = layOut(400)
    const { container, selection } = renderList(Array.from({ length: 30 }, (_, i) => t(i)))
    act(() => selection.highlight("t0"))
    act(() => row(container, "t0")!.focus())
    await frame()
    fireEvent.keyDown(document.activeElement!, { key: "j" })
    const at = document.activeElement as HTMLElement
    expect(at.getAttribute("data-task-id")).toBe("t1")
    expect(lit(container)).toEqual(["t1"])
    expect(stops(container), "before any frame").toEqual(["t1"])
    fireEvent.keyDown(at, { key: "Tab" })
    await waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("checkbox"))
    expect(document.activeElement?.closest("[data-task-id]")?.getAttribute("data-task-id")).toBe("t1")
  })
})

// The keys' place on a row: the cursor's ring and the select box's ring. As group variants (group-focus-visible/row:,
// group-has-[:focus-visible]/row:, group-data-[highlighted]/row:) every element under a row was read against the row's
// focus and highlight, so each J restyled both rows' subtrees. A row's children now read it through a child selector
// (globals.css: kbd, kbd-lit, kbd-box), which restyles only the marks.
/** Display utilities, which move a box in or out of layout. */
const DISPLAY = /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|inline-table|contents|flow-root|table|table-[\w-]+|list-item|hidden)$/
/** Variants of the page or the screen, not of a row's state: a breakpoint, a container's or a media query, a theme. */
const NOT_STATE = /^(?:sm|md|lg|xl|2xl|(?:max|min)-[\w-]+|@[\w/-]+|\[@media[^\]]*\]|\[@supports[^\]]*\]|print|dark|light|motion-safe|motion-reduce|portrait|landscape|contrast-[\w-]+|forced-colors|pointer-[\w-]+|any-pointer-[\w-]+)$/
/** The classes in `text` that set display under a state variant (kbd-lit:block, hover:hidden, group-data-[x]/row:flex). */
function displayToggles(text: string): string[] {
  const out: string[] = []
  for (const token of text.split(/[\s"'`{}(),]+/)) {
    // A class's variants, split at the colons outside its brackets.
    const parts: string[] = []
    let depth = 0
    let from = 0
    for (let i = 0; i < token.length; i++) {
      const ch = token[i]
      if (ch === "[" || ch === "(") depth++
      else if (ch === "]" || ch === ")") depth--
      else if (ch === ":" && depth === 0) {
        parts.push(token.slice(from, i))
        from = i + 1
      }
    }
    const utility = token.slice(from).replace(/^!|!$/g, "")
    if (parts.length && DISPLAY.test(utility) && parts.some((v) => !NOT_STATE.test(v))) out.push(token)
  }
  return out
}

const KEYS_GROUP_VARIANT = /(?:^|[\s"'`])(?:[^\s"'`:]+:)*group-(?!hover\b)[\w-]*(?:\[[^\]]*\])?\/row:/

describe("the keys' place on a row", () => {
  it("shows its marks by visibility, never display: no state of a row (the keys', a hover, a selection, a held row) moves a box in or out of layout", () => {
    const { container, selection } = renderList(Array.from({ length: 4 }, (_, i) => t(i)))
    // Each state a row's marks answer to: the keys' place and focus, a selection (the Checkbox), a pointer on it.
    act(() => selection.highlight("t1"))
    act(() => row(container, "t1")!.focus())
    act(() => selection.toggle("t2"))
    fireEvent.pointerEnter(row(container, "t3")!, { pointerType: "mouse", clientX: 20, clientY: 30 })
    fireEvent.pointerMove(row(container, "t3")!, { pointerType: "mouse", clientX: 21, clientY: 30 })
    const found = Array.from(container.querySelectorAll<HTMLElement>("[data-task-id] *")).flatMap((el) =>
      displayToggles(el.getAttribute("class") ?? "").map((c) => `<${el.tagName.toLowerCase()}> in ${el.closest("[data-task-id]")!.getAttribute("data-task-id")}: ${c}`),
    )
    expect(found, "a row's state variant that sets display").toEqual([])
    // The cursor in particular, on each row: in layout always, hidden by visibility.
    for (const c of Array.from(container.querySelectorAll<HTMLElement>("[data-task-id] [data-kbd-cursor]"))) {
      expect(c.classList.contains("hidden"), "the cursor is never display: none").toBe(false)
      expect(c.classList.contains("invisible")).toBe(true)
    }
    // A held row's cursor is hidden by visibility too (app/interaction.css), and no CSS rule on a row's marks sets display.
    for (const file of ["app/interaction.css", "app/globals.css"]) {
      const css = readFileSync(join(process.cwd(), file), "utf8")
      for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (/\[data-(?:kbd-cursor|row-box|row-select|reorder-grip)\]/.test(selector)) expect(body, `${file}: ${selector.trim()}`).not.toMatch(/(?:^|[\s;])display\s*:/)
      }
    }
    const held = readFileSync(join(process.cwd(), "app/interaction.css"), "utf8").match(/\[data-reorder-held\] \[data-kbd-cursor\] \{([^}]*)\}/)?.[1] ?? ""
    expect(held).toMatch(/visibility:\s*hidden/)
  })

  it("sets no display by a row's state in any file that draws a [data-task-id]", () => {
    const found = sourceFiles(["components", "app"], /\.tsx$/).flatMap((file) => {
      const src = readFileSync(file, "utf8")
      if (!src.includes("data-task-id")) return []
      return src.split("\n").flatMap((l, i) => displayToggles(l).map((c) => `${file}:${i + 1} ${c}`))
    })
    expect(found).toEqual([])
  })


  afterEach(cleanup)

  it("is read by the row's own children through a child selector, never a group variant on the row", () => {
    const { container, selection } = renderList(Array.from({ length: 3 }, (_, i) => t(i)))
    act(() => selection.highlight("t1"))
    const r = row(container, "t1")!
    for (const el of Array.from(r.querySelectorAll<HTMLElement>("*"))) {
      expect(el.getAttribute("class") ?? "", `<${el.tagName.toLowerCase()}> in a row`).not.toMatch(KEYS_GROUP_VARIANT)
    }
    const cursor = r.querySelector("[data-kbd-cursor]")!
    expect(cursor.parentElement).toBe(r)
    expect(cursor.className).toMatch(/(^| )invisible( |$)/)
    expect(cursor.className).toContain("kbd-lit:visible")
    const box = r.querySelector("[data-row-box]")!
    expect(box.parentElement!.hasAttribute("data-row-select")).toBe(true)
    expect(box.parentElement!.parentElement).toBe(r)
    expect(box.className).toMatch(/(^| )invisible( |$)/)
    for (const c of ["kbd-box:visible", "kbd-box:ring-[1.5px]", "kbd-box:ring-inset", "kbd-box:ring-faint-foreground"]) expect(box.className).toContain(c)
  })

  it("carries no group variant for the keys' place on any list's row (every file that draws a [data-task-id], the keys' item)", () => {
    const found = sourceFiles(["components", "app"], /\.tsx$/).flatMap((file) => {
      const src = readFileSync(file, "utf8")
      if (!src.includes("data-task-id")) return []
      return src.split("\n").flatMap((l, i) => (KEYS_GROUP_VARIANT.test(l) ? [`${file}:${i + 1}`] : []))
    })
    expect(found).toEqual([])
  })

  it("reads the row through child selectors alone (globals.css), the row's own state, as plain as the classes they replace", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const variant = (name: string) => css.match(new RegExp(`@custom-variant ${name} \\((.+)\\);`))?.[1] ?? ""
    expect(variant("kbd")).toBe(":where([data-task-id]:is(:focus-visible, :has(:focus-visible))) > &")
    expect(variant("kbd-lit")).toBe(":where([data-task-id][data-highlighted]:is(:focus-visible, :has(:focus-visible))) > &")
    expect(variant("kbd-box")).toBe(":where([data-task-id]:focus-visible > [data-row-select]) > &")
  })
})
