import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { ConnectionPill } from "@/components/docEditor/ConnectionPill"
import { RecoveredEditsBanner } from "@/components/docEditor/RecoveredEditsBanner"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a doc the server could not open", () => {
  it("says so, with Retry, instead of showing an empty doc", () => {
    vi.useFakeTimers()
    const onRetry = vi.fn()
    render(<ConnectionPill problem="unavailable" onRetry={onRetry} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status").textContent).toMatch(/Couldn.t open this doc\./)
    screen.getByRole("button", { name: "Retry" }).click()
    expect(onRetry).toHaveBeenCalled()
  })
})

// One surface per message (V-21, design review): beside a phone's save notice,
// which says what becomes of the work, the pill names only the connection.
describe("a doc gone offline", () => {
  it("says the changes are kept, in the dot's words, where no save notice is beside it", () => {
    vi.useFakeTimers()
    render(<ConnectionPill problem="offline" />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status").textContent).toBe("Offline. Changes are kept and will sync")
  })

  it("beside a save notice, says only Offline", () => {
    vi.useFakeTimers()
    render(<ConnectionPill problem="offline" docked besideNotice />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status").textContent).toBe("Offline")
  })
})

describe("a doc whose sign-in hasn't brought it", () => {
  it("says it is still connecting, with Try again", () => {
    vi.useFakeTimers()
    const onRetry = vi.fn()
    render(<ConnectionPill problem="stalled" onRetry={onRetry} />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status").textContent).toMatch(/^Still connecting…/)
    screen.getByRole("button", { name: "Try again" }).click()
    expect(onRetry).toHaveBeenCalled()
  })

  // DESIGN-BUILD-8: Try again is the app's own button, floating or docked on a
  // phone: its hover and press, and a finger's touch target round it.
  it("offers Try again as the app's button, with a finger's touch target", () => {
    vi.useFakeTimers()
    for (const docked of [false, true]) {
      const { unmount } = render(<ConnectionPill problem="stalled" onRetry={() => {}} docked={docked} />)
      act(() => vi.advanceTimersByTime(2000))
      expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("data-touch-target"), `docked ${docked}`).toBe(true)
      unmount()
    }
  })
})

// Docked under a phone's top bar, the row is where a toast comes in while the
// keyboard is up, so it says how tall it is for as long as it shows (V-21).
describe("a docked row's height", () => {
  const height = () => document.documentElement.style.getPropertyValue("--docked-row-h")
  // jsdom lays nothing out: the row is as tall as the test says, and a resize
  // is the observer's callback, called as the browser would call it.
  let rowHeight = 44
  let resized: (() => void) | undefined
  class WatchSize {
    constructor(cb: () => void) {
      resized = cb
    }
    observe() {}
    disconnect() {
      resized = undefined
    }
  }
  beforeEach(() => {
    rowHeight = 44
    vi.stubGlobal("ResizeObserver", WatchSize)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => ({ height: rowHeight }) as DOMRect)
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => rowHeight)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("is said while the row shows, and goes with it", () => {
    vi.useFakeTimers()
    const { rerender } = render(<ConnectionPill problem="reconnecting" docked />)
    expect(height()).toBe("")
    act(() => vi.advanceTimersByTime(2000))
    expect(height()).toBe("44px")
    rerender(<ConnectionPill problem={null} docked />)
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.queryByRole("status")).toBeNull()
    expect(height()).toBe("")
  })

  it("is never said by a floating pill", () => {
    vi.useFakeTimers()
    render(<ConnectionPill problem="reconnecting" />)
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole("status")).toBeTruthy()
    expect(height()).toBe("")
  })

  // CR-73 MF1: a row whose words change or wrap while it shows is said again,
  // or a toast comes in over it, the case this height is for.
  it("follows the row while it shows, as its words change or wrap", () => {
    vi.useFakeTimers()
    render(<ConnectionPill problem="reconnecting" docked />)
    act(() => vi.advanceTimersByTime(2000))
    expect(height()).toBe("44px")
    rowHeight = 64
    act(() => resized?.())
    expect(height()).toBe("64px")
  })
})

describe("edits kept aside when the doc changed underneath", () => {
  it("offers them to copy, and can be dismissed", async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
    const onDismiss = vi.fn()
    render(<RecoveredEditsBanner recovered={{ html: "<p>typed offline</p>", text: "typed offline", at: 1 }} onDismiss={onDismiss} />)
    expect(screen.getByRole("status").textContent).toMatch(/your unsaved edits weren.t added/)
    await act(async () => screen.getByRole("button", { name: "Copy your edits" }).click())
    expect(writeText).toHaveBeenCalledWith("typed offline")
    screen.getByRole("button", { name: "Dismiss" }).click()
    expect(onDismiss).toHaveBeenCalled()
  })
})
