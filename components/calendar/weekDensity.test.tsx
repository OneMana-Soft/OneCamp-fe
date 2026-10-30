import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { startOfWeek } from "date-fns"
import { WeekView, HOUR_HEIGHT } from "./weekView"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { pinTestClock } from "@/lib/testing/testClock"

// B1's density (gcal-2): the hour drawn comfortable (56 px), compact (40 px),
// or as tall as fills the screen with the working day ("fit my hours"). The
// hour is one CSS variable on the week, --cal-hour, so a density changes the
// grid at once and draws no block again (weekRenders.test.tsx holds that).

pinTestClock()
installPointerEvent()

const monday = startOfWeek(new Date(2026, 9, 14), { weekStartsOn: 1 })
const at = (d: number, h: number, m = 0) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + d, h, m).toISOString()
const standup = { event_uuid: "e1", event_title: "Standup", event_start_time: at(0, 9), event_end_time: at(0, 10) }
const props = { weekStart: monday, events: [standup], tasks: [], showEvents: true, showTasks: true, onEventClick: vi.fn(), onTaskClick: vi.fn() }

/** The week's root: where the density sets the hour. */
const week = () => document.querySelector<HTMLElement>('[style*="--cal-hour"]')
const hour = () => week()?.style.getPropertyValue("--cal-hour")
const scroller = () => document.querySelector("[data-time-grid-scroll]") as HTMLElement
const grid = () => document.querySelector('[data-day-col="0"]')!.parentElement as HTMLElement

/** The layout a browser would give: seven 100 px days after the gutter, each hour as tall as the week's --cal-hour. */
function laidOut() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const h = 24 * (parseFloat(hour() || "") || HOUR_HEIGHT)
    const col = this.dataset?.dayCol
    const left = col !== undefined ? 56 + Number(col) * 100 : 56
    return { left, right: left + 100, top: 0, bottom: h, width: 100, height: h, x: left, y: 0, toJSON: () => ({}) } as DOMRect
  })
}

/** A scroller this tall, whose scrollTop keeps what is set (jsdom's doesn't). */
function scrollerOf(height: number) {
  const el = scroller()
  let top = 0
  Object.defineProperty(el, "clientHeight", { configurable: true, value: height })
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = v) })
  return el
}

/** ResizeObserver, run by hand: jsdom has none. */
const observed: Array<() => void> = []
beforeEach(() => {
  observed.length = 0
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private cb: () => void) {}
      observe() {
        observed.push(this.cb)
      }
      unobserve() {}
      disconnect() {
        observed.splice(observed.indexOf(this.cb), 1)
      }
    },
  )
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

describe("the week's density", () => {
  it("draws the hour 56 px tall, or 40 px compact", () => {
    const { rerender } = render(<WeekView {...props} />)
    expect(hour()).toBe("56px")
    rerender(<WeekView {...props} density="compact" />)
    expect(hour()).toBe("40px")
    rerender(<WeekView {...props} density="comfortable" />)
    expect(hour()).toBe("56px")
  })

  it("places blocks by the hour, so a density moves every one at once", () => {
    render(<WeekView {...props} density="compact" />)
    const block = document.querySelector<HTMLElement>('[data-hue-block="event"]')!
    expect(block.style.top).toBe("calc(var(--cal-hour)*9)")
    expect(block.style.height).toBe("max(calc(var(--cal-hour)*1) - 2px, 14px)")
  })

  it("reads a drag's hours from the grid as drawn: on a compact grid an hour is 40 px", () => {
    laidOut()
    const onEventChange = vi.fn()
    render(<WeekView {...props} density="compact" onEventChange={onEventChange} />)
    const block = document.querySelector<HTMLElement>('[data-hue-block="event"]')!
    fireEvent.pointerDown(block, { button: 0, clientX: 100, clientY: 9 * 40 + 5 })
    fireEvent.pointerMove(grid(), { clientX: 100, clientY: 11 * 40 + 5 })
    fireEvent.pointerUp(grid(), { clientX: 100, clientY: 11 * 40 + 5 })
    expect(onEventChange).toHaveBeenCalledWith("e1", new Date(at(0, 11)), new Date(at(0, 12)))
  })

  it("fits the working day to the screen: 9 AM at its top, 6 PM at its foot, as the screen changes", () => {
    laidOut()
    const { rerender } = render(<WeekView {...props} />)
    const el = scrollerOf(556)
    rerender(<WeekView {...props} density="fit" />)
    // (556 - 16) / 9 hours: 60 px an hour, 9 AM 8 px below the top.
    expect(hour()).toBe("60px")
    expect(el.scrollTop).toBe(9 * 60 - 8)
    Object.defineProperty(el, "clientHeight", { configurable: true, value: 736 })
    act(() => observed.forEach((f) => f()))
    expect(hour()).toBe("80px")
    expect(el.scrollTop).toBe(9 * 80 - 8)
  })

  it("never draws fit's hour shorter than compact's", () => {
    laidOut()
    const { rerender } = render(<WeekView {...props} />)
    scrollerOf(200)
    rerender(<WeekView {...props} density="fit" />)
    expect(hour()).toBe("40px")
  })

  it("keeps the time at the top of the view when the density changes", () => {
    laidOut()
    const { rerender } = render(<WeekView {...props} />)
    const el = scrollerOf(600)
    el.scrollTop = 10 * 56
    fireEvent.scroll(el)
    // A browser has cut scrollTop to the shorter grid's most by now: the time kept is the one scrolled to.
    el.scrollTop = 24 * 40 - 600
    rerender(<WeekView {...props} density="compact" />)
    expect(el.scrollTop).toBe(10 * 40)
  })
})
