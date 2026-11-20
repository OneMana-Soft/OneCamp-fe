import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { ConnectionPill } from "@/components/docEditor/ConnectionPill"
import { RecoveredEditsBanner } from "@/components/docEditor/RecoveredEditsBanner"
import { SAY_PROBLEM_AFTER_MS } from "@/components/docEditor/connectionTiming"
import { SaveDot } from "@/components/docEditor/SaveDot"
import { OfflineNotice } from "@/components/error/OfflineNotice"
import { TooltipProvider } from "@/components/ui/tooltip"

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

// A screen reader says a live region's change reliably only while its node
// stays; a new region is often read late or not at all. So whatever the pill
// says, it says it in ONE status node, docked or floating (CR-B32 F1, V-667).
describe("the pill's live region", () => {
  for (const docked of [false, true]) {
    it(`stays one node from offline through reconnecting, unavailable and Back online${docked ? ", docked" : ""}`, () => {
      vi.useFakeTimers()
      const retry = () => {}
      const { rerender } = render(<ConnectionPill problem="offline" docked={docked} onRetry={retry} />)
      act(() => void vi.advanceTimersByTime(SAY_PROBLEM_AFTER_MS))
      const node = screen.getByRole("status")
      expect(node.textContent).toContain("Offline")
      const next = [
        ["reconnecting", "Reconnecting"],
        ["stalled", "Still connecting"],
        ["unavailable", "Couldn't open this doc."],
        ["offline", "Offline"],
        [null, "Back online"],
      ] as const
      for (const [problem, words] of next) {
        rerender(<ConnectionPill problem={problem} docked={docked} onRetry={retry} />)
        act(() => void vi.advanceTimersByTime(0))
        expect(screen.getByRole("status").textContent).toContain(words)
        expect(screen.getByRole("status"), `${problem ?? "back"} in the same node`).toBe(node)
      }
    })
  }
})

// V-695: offline, a page says so once, counted over every live region,
// role=status or aria-live. On a doc page the doc's own pill speaks, and the
// app's connection pill (OfflineNotice) and the header dot's spoken copy
// (SaveDot's live region) yield to it while it shows; before its wait is up,
// the dot speaks. Where a save dot is the page's only voice (a table, a
// board), the dot speaks and the app's pill yields.
describe("a page offline", () => {
  afterEach(() => vi.restoreAllMocks())
  const offlineVoices = () =>
    [...document.querySelectorAll<HTMLElement>('[role="status"], [aria-live]')].filter((n) => /offline/i.test(n.textContent ?? ""))

  for (const docked of [false, true]) {
    it(`has one voice saying offline, the doc's pill${docked ? ", docked" : ""}`, () => {
      vi.useFakeTimers()
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
      render(
        <TooltipProvider>
          <SaveDot state="offline" live />
          <ConnectionPill problem="offline" docked={docked} />
          <OfflineNotice />
        </TooltipProvider>,
      )
      expect(offlineVoices().map((n) => n.textContent)).toEqual(["Offline. Changes are kept and will sync"])
      expect(offlineVoices()[0].getAttribute("role")).toBeNull()
      act(() => void vi.advanceTimersByTime(SAY_PROBLEM_AFTER_MS))
      const voices = offlineVoices()
      expect(voices.map((n) => n.textContent)).toEqual(["Offline. Changes are kept and will sync"])
      expect(screen.getAllByRole("status")).toHaveLength(1)
      // The header dot still shows it.
      expect(screen.getByText("Offline")).toBeTruthy()
    })
  }

  it("with only a save dot, the dot speaks and the app's pill yields", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const { rerender } = render(
      <TooltipProvider>
        <SaveDot state="offline" live />
        <OfflineNotice />
      </TooltipProvider>,
    )
    expect(offlineVoices().map((n) => n.textContent)).toEqual(["Offline. Changes are kept and will sync"])
    expect(document.querySelector("[data-connection-pill]")).toBeNull()
    // Back to saved: the dot says so, and offline is the app pill's again if the network is still gone.
    rerender(
      <TooltipProvider>
        <SaveDot state="saved" live />
        <OfflineNotice />
      </TooltipProvider>,
    )
    expect(screen.getByRole("status").textContent).toMatch(/You're offline/)
  })
})
