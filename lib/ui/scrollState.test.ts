import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"

import { SCROLL_SETTLE_MS, isBusyPointer, isScrolling, useScrolling, watchListMoving, whenListStill } from "./scrollState"

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

// With the rows' pointer events kept on while a list scrolls (so a press just
// after a scroll lands: patches/virtua@0.41.5.patch), a list carried its rows
// under a resting pointer, and each lit and built its hover toolbar as it
// passed: 14 to 29 toolbars a spin (27 Oct 2026). The list says it is moving,
// and the rows wait for it to settle.
describe("a list's moving mark", () => {
  /** A list's scroller with a row in it. */
  const list = () => {
    const el = document.body.appendChild(document.createElement("div"))
    const row = el.appendChild(document.createElement("div"))
    return { el, row }
  }
  /** A wheel's turn as Chromium sends it: a scroll, then a scrollend once its scroll is done. */
  const turn = (el: Element) => {
    el.dispatchEvent(new Event("scroll"))
    el.dispatchEvent(new Event("scrollend"))
  }

  it("stays on while the list keeps moving, across the scrollend each turn of a wheel ends with", () => {
    vi.useFakeTimers()
    const { el, row } = list()
    watchListMoving(el)
    const ran = vi.fn()
    // A spin's turns come 50 ms apart (e2e/sharedListRows' spin): ended at
    // each scrollend, the move stopped and began again between turns, and the
    // rows under the pointer lit and showed their actions at each.
    for (let i = 0; i < 6; i++) {
      turn(el)
      expect(el.hasAttribute("data-list-moving")).toBe(true)
      whenListStill(row, ran)
      vi.advanceTimersByTime(50)
    }
    expect(el.hasAttribute("data-list-moving")).toBe(true)
    expect(ran).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("comes off the page's settle after the last scroll, with a scrollend or none, and what waited runs then, once", () => {
    vi.useFakeTimers()
    const { el, row } = list()
    watchListMoving(el)
    for (const ends of [true, false]) {
      el.dispatchEvent(new Event("scroll"))
      if (ends) el.dispatchEvent(new Event("scrollend"))
      const ran = vi.fn()
      whenListStill(row, ran)
      vi.advanceTimersByTime(SCROLL_SETTLE_MS - 1)
      expect(el.hasAttribute("data-list-moving")).toBe(true)
      vi.advanceTimersByTime(1)
      expect(el.hasAttribute("data-list-moving")).toBe(false)
      expect(ran).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(SCROLL_SETTLE_MS)
      expect(ran).toHaveBeenCalledTimes(1)
    }
    vi.useRealTimers()
  })

  it("runs a row's wait at once while its list is still, or isn't watched", () => {
    const { el, row } = list()
    const ran = vi.fn()
    whenListStill(row, ran)
    expect(ran).toHaveBeenCalledTimes(1)
    watchListMoving(el)
    whenListStill(row, ran)
    expect(ran).toHaveBeenCalledTimes(2)
  })

  it("lets go of the list when it goes: no mark, no listener, and what waited runs", () => {
    const { el, row } = list()
    const undo = watchListMoving(el)!
    el.dispatchEvent(new Event("scroll"))
    const ran = vi.fn()
    whenListStill(row, ran)
    undo()
    expect(el.hasAttribute("data-list-moving")).toBe(false)
    expect(ran).toHaveBeenCalledTimes(1)
    el.dispatchEvent(new Event("scroll"))
    expect(el.hasAttribute("data-list-moving")).toBe(false)
    expect(watchListMoving(null)).toBeUndefined()
  })
})
