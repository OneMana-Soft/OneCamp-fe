import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EDGE_SCROLL, HIT_KEEP_MS, edgeScroller, edgeSpeed, scrollersAt } from "./edgeScroll"

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

  // A project timeline's bar (REVIEW-FE-SHELL db2): it moves by days, so its
  // drag scrolls sideways only, and its names sit over the scroller's left edge.
  it("starts its zone past a column drawn over the edge, and scrolls the one way it is told", () => {
    const el = scroller(1000)
    let left = 200
    Object.defineProperty(el, "scrollLeft", { get: () => left, set: (v: number) => (left = Math.max(0, v)) })
    const s = edgeScroller(el, undefined, undefined, { inset: { left: 160 }, axis: "x" })
    // In the middle: still. Just past the names (100 to 260): back a step,
    // less than at the edge; over the names, past the edge: back at full speed.
    s.follow(400, 250)
    run()
    expect(left).toBe(200)
    s.follow(300, 250)
    run()
    expect(left).toBe(200 - 3)
    s.follow(240, 250)
    run()
    expect(left).toBe(200 - 3 - EDGE_SCROLL.maxSpeed)
    // At the bottom edge too, but sideways only: nothing goes down.
    s.follow(499, 399)
    run()
    expect(el.scrollTop).toBe(0)
    s.stop()
  })

  // A long list's drag (L-1): the hit test and the ancestors' styles took 3 to
  // 8 ms of every frame. The scrollers found stay while the pointer is inside
  // the innermost, until one scrolls, for HIT_KEEP_MS at most.
  it("finds the scrollers under the pointer once while it moves inside the innermost", () => {
    const el = scroller(1000)
    el.style.overflowY = "auto"
    Object.defineProperty(el, "scrollHeight", { value: 1300 })
    Object.defineProperty(el, "clientHeight", { value: 300 })
    const hits = vi.fn(() => [el, document.body, document.documentElement])
    document.elementsFromPoint = hits
    // The clock the scrollers' age is read by, moved by hand.
    let now = 1000
    vi.spyOn(performance, "now").mockImplementation(() => now)
    const s = edgeScroller()
    for (const y of [200, 210, 220, 230]) {
      s.follow(300, y)
      run()
      now += 30
    }
    expect(hits).toHaveBeenCalledTimes(1)
    expect(el.scrollTop).toBe(0)
    // Kept for HIT_KEEP_MS at most: a nested scroller it entered is found then.
    now += HIT_KEEP_MS
    s.follow(300, 240)
    run()
    expect(hits).toHaveBeenCalledTimes(2)
    hits.mockClear()
    // At its edge, still inside: it scrolls with what it found, and, as it
    // scrolled, looks again on the next step.
    s.follow(300, 399)
    run()
    expect(hits).toHaveBeenCalledTimes(0)
    expect(el.scrollTop).toBe(18)
    run()
    expect(hits).toHaveBeenCalledTimes(1)
    expect(el.scrollTop).toBe(36)
    s.stop()
    // Out of the innermost, it looks again.
    s.follow(300, 200)
    run()
    s.follow(50, 200)
    run()
    expect(hits).toHaveBeenCalledTimes(3)
    s.stop()
    vi.restoreAllMocks()
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

describe("one edge scroll", () => {
  it("is the one a project timeline's bar drag uses: no frame loop of its own", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("components/project/timeline/ProjectTimeline.tsx", "utf8")
    expect(src).toMatch(/edgeScroller\(el, measure, undefined, \{ inset: \{ left: nameWidth \}, axis: "x" \}\)/)
    expect(src).not.toMatch(/EDGE_STEP|requestAnimationFrame\(edgeScroll\)/)
  })
})
