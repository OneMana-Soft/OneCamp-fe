import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EDGE_SCROLL, edgeScroller, edgeSpeed, scrollersAt } from "./edgeScroll"

// INTERACTION_SPEC.md §2.5: a 48px edge under a pointer, 64px under a finger,
// 0 to 18px a frame, both axes, the innermost scroller first.

const box = { top: 100, left: 100, right: 500, bottom: 400 }

describe("edgeSpeed", () => {
  it("is still in the middle and at the zone's inner side", () => {
    expect(edgeSpeed(box, 300, 250)).toEqual({ dx: 0, dy: 0 })
    expect(edgeSpeed(box, 500 - 48, 400 - 48)).toEqual({ dx: 0, dy: 0 })
  })

  it("ramps to 18px a frame at the edge, on both axes, and never past it", () => {
    expect(edgeSpeed(box, 500, 250)).toEqual({ dx: 18, dy: 0 })
    expect(edgeSpeed(box, 300, 100)).toEqual({ dx: 0, dy: -18 })
    expect(edgeSpeed(box, 490, 390)).toEqual({ dx: 14, dy: 14 })
    expect(edgeSpeed(box, 900, 250).dx).toBe(EDGE_SCROLL.maxSpeed)
    expect(edgeSpeed(box, 20, 250).dx).toBe(-EDGE_SCROLL.maxSpeed)
  })

  it("gives a finger the wider zone", () => {
    expect(edgeSpeed(box, 500 - 56, 250).dx).toBe(0)
    expect(edgeSpeed(box, 500 - 56, 250, true).dx).toBe(2)
  })
})

describe("edgeScroller", () => {
  let frames: FrameRequestCallback[] = []
  const run = () => {
    const now = frames
    frames = []
    now.forEach((f) => f(0))
  }
  beforeEach(() => {
    frames = []
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = []
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  /** A scroller 400 by 300 at (100, 100), with room to scroll `max` px down. */
  function scroller(max: number) {
    const el = document.createElement("div")
    let top = 0
    Object.defineProperty(el, "scrollTop", { get: () => top, set: (v: number) => (top = Math.max(0, Math.min(max, v))) })
    el.getBoundingClientRect = () => ({ ...box, width: 400, height: 300, x: 100, y: 100, toJSON: () => ({}) })
    document.body.append(el)
    return el
  }

  it("keeps scrolling while the pointer rests at the edge, and says so each step", () => {
    const el = scroller(1000)
    const scrolled = vi.fn()
    const s = edgeScroller(el, scrolled)
    s.follow(300, 399)
    run()
    run()
    expect(el.scrollTop).toBe(36)
    expect(scrolled).toHaveBeenCalledTimes(2)
    s.stop()
    run()
    expect(el.scrollTop).toBe(36)
  })

  it("stops on its own at the end, and starts again on the next move", () => {
    const el = scroller(20)
    const s = edgeScroller(el)
    s.follow(300, 399)
    run()
    run()
    run()
    expect(el.scrollTop).toBe(20)
    expect(frames).toHaveLength(0)
    s.follow(300, 101)
    run()
    expect(el.scrollTop).toBe(2)
  })

  it("scrolls nothing when there is no scroller", () => {
    const s = edgeScroller(null)
    s.follow(300, 399)
    run()
    expect(frames).toHaveLength(0)
  })
})

describe("scrollersAt", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("lists the scrollers under a point innermost first, skipping the lifted copy", () => {
    document.body.innerHTML = `<div id="board" style="overflow-x:auto"><div id="col" style="overflow-y:auto"><p id="card">Card</p></div></div><div id="ghost"></div>`
    const [board, col, card, ghost] = ["board", "col", "card", "ghost"].map((id) => document.getElementById(id)!)
    for (const [el, w, h] of [[board, 2000, 300], [col, 280, 900]] as const) {
      Object.defineProperty(el, "scrollWidth", { value: w })
      Object.defineProperty(el, "clientWidth", { value: 280 })
      Object.defineProperty(el, "scrollHeight", { value: h })
      Object.defineProperty(el, "clientHeight", { value: 300 })
    }
    document.elementsFromPoint = () => [ghost, card, col, board, document.body, document.documentElement]
    expect(scrollersAt(10, 10, (el) => el === ghost)).toEqual([col, board])
  })
})
