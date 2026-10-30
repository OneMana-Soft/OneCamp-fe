import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { WeekView, HOUR_HEIGHT } from "./weekView"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

// CAL-BUG-18: on the day the clocks change, blocks were placed by the time
// elapsed since midnight but the hour lines by the clock, so a 10:00 meeting
// sat on the 09:00 line (or the 11:00 one in the autumn), and a drag saved it
// from there. The 2026 changes: the US on 8 March and 1 November, the UK on
// 29 March and 25 October.
// The days are built in the zone, after it is set: a Date made at import
// time is a midnight of the machine's own zone.
const CHANGES: Array<[zone: string, label: string, month: number, date: number]> = [
  ["America/New_York", "8 March", 2, 8],
  ["America/New_York", "1 November", 10, 1],
  ["Europe/London", "29 March", 2, 29],
  ["Europe/London", "25 October", 9, 25],
]

installPointerEvent()

const original = process.env.TZ
beforeEach(() => {
  // One 100px column after a 56px gutter, the grid's top at 0.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { left: 56, right: 156, top: 0, bottom: 24 * HOUR_HEIGHT, width: 100, height: 24 * HOUR_HEIGHT, x: 56, y: 0, toJSON: () => ({}) } as DOMRect
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
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const at = (day: Date, h: number, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
const y = (h: number) => h * HOUR_HEIGHT

function dayView(day: Date, start: Date, end: Date, onEventChange = vi.fn()) {
  const ev = { event_uuid: "e1", event_title: "Standup", event_start_time: start.toISOString(), event_end_time: end.toISOString() }
  render(<WeekView weekStart={day} dayCount={1} events={[ev]} tasks={[]} showEvents showTasks onEventChange={onEventChange} onEventClick={vi.fn()} onTaskClick={vi.fn()} />)
  return { block: document.querySelector('[data-hue-block="event"]') as HTMLElement, grid: document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement, onEventChange }
}

describe("a day the clocks change on", () => {
  for (const [zone, label, month, date] of CHANGES) {
    it(`draws a 10:00 meeting on the 10:00 line, an hour tall, on ${label} in ${zone}`, () => {
      process.env.TZ = zone
      const day = new Date(2026, month, date)
      // It is a changeover day: 23 or 25 hours long.
      expect(Math.abs(new Date(2026, month, date + 1).getTime() - day.getTime() - 86_400_000)).toBe(3_600_000)
      const { block } = dayView(day, at(day, 10), at(day, 11))
      // Ten hours down and one tall, at the hour the density draws (--cal-hour).
      expect(block.style.top).toBe("calc(var(--cal-hour)*10)")
      expect(block.style.height).toBe("max(calc(var(--cal-hour)*1) - 2px, 14px)")
    })

    it(`saves nothing for a drag by nothing, and 10:15 for a quarter hour, on ${label} in ${zone}`, () => {
      process.env.TZ = zone
      const day = new Date(2026, month, date)
      const { block, grid, onEventChange } = dayView(day, at(day, 10), at(day, 11))
      // Lifted (it travelled sideways) but moved by nothing.
      fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(10) + 5 })
      fireEvent.pointerMove(grid, { clientX: 110, clientY: y(10) + 5 })
      fireEvent.pointerUp(grid, { clientX: 110, clientY: y(10) + 5 })
      expect(onEventChange).not.toHaveBeenCalled()
      // A quarter hour down.
      fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(10) + 5 })
      fireEvent.pointerMove(grid, { clientX: 100, clientY: y(10) + 5 + HOUR_HEIGHT / 4 })
      fireEvent.pointerUp(grid, { clientX: 100, clientY: y(10) + 5 + HOUR_HEIGHT / 4 })
      expect(onEventChange).toHaveBeenCalledWith("e1", at(day, 10, 15), at(day, 11, 15))
    })
  }
})

describe("a short meeting", () => {
  it("keeps its length when it's moved, though it's drawn 20 minutes tall", () => {
    const day = new Date(2026, 9, 14)
    const { block, grid, onEventChange } = dayView(day, at(day, 9), at(day, 9, 15))
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: y(9) + 2 })
    fireEvent.pointerMove(grid, { clientX: 100, clientY: y(10) + 2 })
    fireEvent.pointerUp(grid, { clientX: 100, clientY: y(10) + 2 })
    expect(onEventChange).toHaveBeenCalledWith("e1", at(day, 10), at(day, 10, 15))
  })
})
