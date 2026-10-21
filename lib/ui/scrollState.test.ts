import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

import { SCROLL_SETTLE_MS, isBusyPointer, isScrolling, useScrolling } from "./scrollState"

// A list scrolled under a resting pointer sends pointerenter to every row that
// passes beneath it. Each row then mounted its hover controls (the task list's
// select box: 9,000 to 17,000 renders a scroll on the 2,000-task project,
// FLUIDITY-LEAD, 20 Oct 2026). A row asks isBusyPointer() first. The page's
// scroll and a drag (lib/ui/dnd's data-dragging) both count as busy.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute("data-dragging")
  document.body.innerHTML = ""
})

/** Moves performance.now() to `ms`. */
const at = (ms: number) => vi.spyOn(performance, "now").mockReturnValue(ms)

describe("the page's scroll state", () => {
  it("is busy while anything on the page scrolls, and free once it has settled", () => {
    renderHook(() => useScrolling())
    const list = document.body.appendChild(document.createElement("div"))
    at(10_000)
    // A scroller deep in the page: scroll doesn't bubble, and the watch still sees it.
    list.dispatchEvent(new Event("scroll"))
    expect(isScrolling()).toBe(true)
    expect(isBusyPointer()).toBe(true)
    at(10_000 + SCROLL_SETTLE_MS - 1)
    expect(isBusyPointer()).toBe(true)
    at(10_000 + SCROLL_SETTLE_MS)
    expect(isScrolling()).toBe(false)
    expect(isBusyPointer()).toBe(false)
  })

  it("counts the document's own scroll too", () => {
    renderHook(() => useScrolling())
    at(20_000)
    document.dispatchEvent(new Event("scroll"))
    expect(isBusyPointer()).toBe(true)
  })

  it("is busy while a drag carries the pointer, scrolling or not", () => {
    at(30_000)
    expect(isBusyPointer()).toBe(false)
    document.documentElement.setAttribute("data-dragging", "true")
    expect(isBusyPointer()).toBe(true)
    document.documentElement.setAttribute("data-dragging", "invalid")
    expect(isBusyPointer()).toBe(true)
  })

  it("settles quickly enough that a pointer resting after the scroll is free within a few frames", () => {
    expect(SCROLL_SETTLE_MS).toBeGreaterThanOrEqual(100)
    expect(SCROLL_SETTLE_MS).toBeLessThanOrEqual(200)
  })
})
