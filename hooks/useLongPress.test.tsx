import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useLongPress } from "./useLongPress"

// Holding a message opens its menu; tapping it opens the thread. On a phone
// slowed 4x, a plain tap on "2 replies" opened the menu instead: the hold
// timer and the finger's touchend were both queued behind a long render, and
// the timer ran first.

function Row({ onLongPress }: { onLongPress: () => void }) {
  const press = useLongPress(onLongPress, { threshold: 500 })
  return (
    <div data-testid="row" {...press}>
      message
    </div>
  )
}

const at = (x = 120, y = 200) => ({ touches: [{ clientX: x, clientY: y }] })

// The page's clock, moved by hand: a busy main thread is time passing while
// no timer gets to run.
let clock = 0
const busyFor = (ms: number) => {
  clock += ms
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "Date"] })
  vi.spyOn(performance, "now").mockImplementation(() => clock)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("useLongPress", () => {
  it("opens after a still hold", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    fireEvent.touchStart(screen.getByTestId("row"), at())
    act(() => vi.advanceTimersByTime(520))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("does not open for a tap", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    const row = screen.getByTestId("row")
    fireEvent.touchStart(row, at())
    act(() => vi.advanceTimersByTime(80))
    busyFor(80)
    fireEvent.touchEnd(row)
    // The phone's compatibility mousedown after the tap must not start a press.
    fireEvent.mouseDown(row)
    act(() => vi.advanceTimersByTime(1000))
    expect(open).not.toHaveBeenCalled()
  })

  it("does not open for a tap whose touchend was held up by a busy page", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    const row = screen.getByTestId("row")
    fireEvent.touchStart(row, at())
    // The main thread is busy for 900ms: time passes, nothing runs...
    busyFor(900)
    // ...then the overdue hold timer runs first,
    act(() => vi.advanceTimersByTime(500))
    // ...and only then the touchend that was waiting behind it.
    fireEvent.touchEnd(row)
    act(() => vi.advanceTimersByTime(100))
    expect(open, "a tap during a long render opened the menu").not.toHaveBeenCalled()
  })

  it("does not open when the system takes the touch, or the finger scrolls", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    const row = screen.getByTestId("row")
    fireEvent.touchStart(row, at())
    fireEvent(row, new Event("touchcancel"))
    act(() => vi.advanceTimersByTime(600))
    fireEvent.touchStart(row, at(120, 200))
    fireEvent.touchMove(row, at(120, 260))
    act(() => vi.advanceTimersByTime(600))
    expect(open).not.toHaveBeenCalled()
  })

  it("leaves the screen's edges to the back gesture", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    fireEvent.touchStart(screen.getByTestId("row"), at(10, 200))
    act(() => vi.advanceTimersByTime(600))
    expect(open).not.toHaveBeenCalled()
  })

  it("still opens on a slow phone when the finger really is held", () => {
    const open = vi.fn()
    render(<Row onLongPress={open} />)
    fireEvent.touchStart(screen.getByTestId("row"), at())
    busyFor(900)
    act(() => vi.advanceTimersByTime(500))
    act(() => vi.advanceTimersByTime(100))
    expect(open).toHaveBeenCalledTimes(1)
  })
})
