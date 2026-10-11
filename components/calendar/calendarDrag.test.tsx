import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { addDays, startOfWeek } from "date-fns"
import { WeekView, HOUR_HEIGHT } from "./weekView"

// content.md C13: drag on the grid to draft an event, hold a block to move it.
const monday = startOfWeek(new Date(2026, 9, 14), { weekStartsOn: 1 })
const at = (d: number, h: number) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d, h).toISOString()

// jsdom has no PointerEvent: without one, a pointer event carries no coordinates.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
    }
  }
  ;(window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill
}

beforeEach(() => {
  // Seven 100px columns after a 56px gutter, the grid's top at 0.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const col = this.dataset?.dayCol
    if (col !== undefined) {
      const left = 56 + Number(col) * 100
      return { left, right: left + 100, top: 0, bottom: 24 * HOUR_HEIGHT, width: 100, height: 24 * HOUR_HEIGHT, x: left, y: 0, toJSON: () => ({}) } as DOMRect
    }
    return { left: 56, right: 756, top: 0, bottom: 24 * HOUR_HEIGHT, width: 700, height: 24 * HOUR_HEIGHT, x: 56, y: 0, toJSON: () => ({}) } as DOMRect
  })
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => { f(0); return 0 })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const y = (h: number) => h * HOUR_HEIGHT

describe("dragging on the week", () => {
  it("drafts an event from the press to the pointer, snapped to quarter hours", () => {
    const onDraft = vi.fn()
    render(<WeekView weekStart={monday} events={[]} tasks={[]} showEvents showTasks onDraft={onDraft} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const col = document.querySelector('[data-day-col="2"]') as HTMLElement
    fireEvent.pointerDown(col, { button: 0, clientX: 300, clientY: y(10) })
    const grid = col.parentElement as HTMLElement
    fireEvent.pointerMove(grid, { clientX: 300, clientY: y(11) + 10 })
    expect(document.querySelector("[data-calendar-ghost]")).toBeTruthy()
    fireEvent.pointerUp(grid, { clientX: 300, clientY: y(11) + 10 })
    const [draft] = onDraft.mock.calls[0]
    expect(draft.start).toEqual(new Date(addDays(monday, 2).setHours(10, 0, 0, 0)))
    expect(draft.end).toEqual(new Date(addDays(monday, 2).setHours(11, 15, 0, 0)))
  })

  it("moves a held block to another day and time through the change callback", () => {
    const onChange = vi.fn()
    const ev = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
    render(<WeekView weekStart={monday} events={[ev]} tasks={[]} showEvents showTasks onEventChange={onChange} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    const grid = document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement
    fireEvent.pointerMove(grid, { clientX: 300, clientY: y(11) + 5 })
    expect(document.querySelector("[data-drag-origin]")).toBeTruthy()
    fireEvent.pointerUp(grid, { clientX: 300, clientY: y(11) + 5 })
    expect(onChange).toHaveBeenCalledWith("e1", new Date(addDays(monday, 2).setHours(11, 0, 0, 0)), new Date(addDays(monday, 2).setHours(12, 0, 0, 0)))
  })

  it("treats a press without travel as a click", () => {
    const onClick = vi.fn()
    const ev = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
    render(<WeekView weekStart={monday} events={[ev]} tasks={[]} showEvents showTasks onEventChange={vi.fn()} onEventClick={onClick} onTaskClick={vi.fn()} />)
    const block = document.querySelector('[data-hue-block="event"]') as HTMLElement
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 5 })
    fireEvent.pointerUp(block.parentElement!.parentElement as HTMLElement, { clientX: 100, clientY: y(9) + 5 })
    expect(onClick).toHaveBeenCalledWith("e1", block)
  })
})
