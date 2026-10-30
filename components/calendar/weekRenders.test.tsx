import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { startOfWeek } from "date-fns"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock } from "@/lib/testing/testClock"

// Every block the week draws (a timed block, or HueBlock's all-day ones), as
// React DevTools sees each commit, so a press can be held to drawing only
// what it changes.
const drawn = vi.hoisted(() => {
  const c = { blocks: 0 }
  const BLOCKS = new Set(["TimedBlock", "HueBlock"])
  const nameOf = (t: any): string => (!t ? "" : t.displayName || t.name || (t.render && t.render.name) || (t.type && nameOf(t.type)) || "")
  const walk = (next: any, prev: any) => {
    if ((prev === null || (next.flags & 1) === 1) && typeof next.type !== "string" && BLOCKS.has(nameOf(next.type))) c.blocks++
    if (prev !== null && next.child === prev.child) return
    for (let child = next.child; child; child = child.sibling) walk(child, prev === null ? null : child.alternate)
  }
  ;(globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(r: unknown) {
      const id = this.renderers.size + 1
      this.renderers.set(id, r)
      return id
    },
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id: number, root: any) {
      try {
        walk(root.current, root.current.alternate)
      } catch {
        /* a shape this walk doesn't know */
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
  return c
})

import { WeekView, HOUR_HEIGHT } from "./weekView"

pinTestClock()
installPointerEvent()

const monday = startOfWeek(new Date(2026, 9, 14), { weekStartsOn: 1 })
const at = (d: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d, h, m).toISOString()
/** A full week: two meetings a day, Monday to Friday, and a third on Wednesday. */
const busyWeek = () => [
  ...[0, 1, 2, 3, 4].flatMap((d) => [
    { event_uuid: `a${d}`, event_title: `Standup ${d}`, event_start_time: at(d, 9), event_end_time: at(d, 9, 30) },
    { event_uuid: `b${d}`, event_title: `Review ${d}`, event_start_time: at(d, 14), event_end_time: at(d, 15) },
  ]),
  { event_uuid: "c2", event_title: "Planning", event_start_time: at(2, 11), event_end_time: at(2, 12) },
]
const BLOCKS = busyWeek().length

beforeEach(() => {
  drawn.blocks = 0
  // Seven 100px columns after a 56px gutter, the grid's top at 0.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const col = this.dataset?.dayCol
    if (col !== undefined) {
      const left = 56 + Number(col) * 100
      return { left, right: left + 100, top: 0, bottom: 24 * HOUR_HEIGHT, width: 100, height: 24 * HOUR_HEIGHT, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    }
    return { left: 56, right: 756, top: 0, bottom: 24 * HOUR_HEIGHT, width: 700, height: 24 * HOUR_HEIGHT, x: 56, y: 0, toJSON: () => ({}) } as DOMRect
  })
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
    f(0)
    return 0
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const props = { tasks: [], showEvents: true, showTasks: true, onEventChange: vi.fn(), onDraft: vi.fn(), onEventClick: vi.fn(), onTaskClick: vi.fn() }
const grid = () => document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement
const y = (h: number) => h * HOUR_HEIGHT

// FLUIDITY-LEAD, 20 Oct 2026: the week drew every block on every pointer move
// of a drag (HueBlock ×500 a drag) and again for each thing around it that
// changed (J drew 57 for a week of them). The week draws a block when the
// block changes; a drag draws the one block it moves.
describe("what the week draws", () => {
  it("draws only the moving block while a block is dragged, and keeps it the block pressed", () => {
    render(<WeekView weekStart={monday} events={busyWeek()} {...props} />)
    drawn.blocks = 0
    const block = document.querySelector('[data-event-uuid="a0"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    for (let i = 1; i <= 20; i++) fireEvent.pointerMove(grid(), { clientX: 100 + i * 10, clientY: y(9) + 5 + i * 8 })
    // Lifted, it is drawn again for each quarter hour or day it reaches, and nothing else is.
    expect(drawn.blocks).toBeLessThanOrEqual(20 + 3)
    // Carried two days on, it is still the element pressed: its card and its menu open from it.
    expect(document.querySelector("[data-drag-origin]")).toBeTruthy()
    expect(document.querySelector('[data-event-uuid="a0"]')).toBe(block)
    expect(block.className).toContain("calendar-lift")
  })

  it("draws no block while the pointer only passes over the grid", () => {
    render(<WeekView weekStart={monday} events={busyWeek()} {...props} />)
    drawn.blocks = 0
    for (let i = 0; i < 30; i++) fireEvent.pointerMove(grid(), { clientX: 150 + (i % 5) * 100, clientY: y(6) + i * 20 })
    expect(drawn.blocks).toBe(0)
  })

  it("draws a new week's blocks once, and none again for the same events read again or the reveal ending", async () => {
    const { rerender } = render(<WeekView weekStart={monday} events={busyWeek()} {...props} />)
    expect(drawn.blocks).toBeLessThanOrEqual(BLOCKS + 2)
    drawn.blocks = 0
    rerender(<WeekView weekStart={monday} events={busyWeek()} {...props} />)
    // The first reveal ends (600 ms in): waited for, not slept.
    await waitFor(() => expect(document.querySelector("[data-reveal]")).toBeNull(), { timeout: 5000 })
    expect(drawn.blocks).toBe(0)
  })

  // B1's density: the hour is the week's --cal-hour, so a density chosen, or
  // fit's hour following the screen's height, moves every block by CSS alone.
  it("draws no block again for a density chosen, or as fit follows the screen's height", () => {
    const resized: Array<() => void> = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: () => void) {}
        observe() {
          resized.push(this.cb)
        }
        disconnect() {}
      },
    )
    const { rerender } = render(<WeekView weekStart={monday} events={busyWeek()} {...props} />)
    const scroller = document.querySelector("[data-time-grid-scroll]") as HTMLElement
    let height = 600
    Object.defineProperty(scroller, "clientHeight", { configurable: true, get: () => height })
    drawn.blocks = 0
    rerender(<WeekView weekStart={monday} events={busyWeek()} {...props} density="compact" />)
    rerender(<WeekView weekStart={monday} events={busyWeek()} {...props} density="fit" />)
    height = 800
    act(() => resized.forEach((f) => f()))
    expect(drawn.blocks).toBe(0)
  })
})
