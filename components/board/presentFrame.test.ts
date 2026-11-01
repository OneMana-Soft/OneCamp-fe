// A board's frame shown as a slide (the call stage's Slides control): zoomed in
// or out to cover SLIDE_COVER of the room the canvas leaves free, the zoom
// pinned, clear of what's drawn over the canvas.

import { afterEach, describe, expect, it, vi } from "vitest"
import { CONTAINER, PHONE_FOOTER, TOOL_ROW, ZOOM_CLUSTER } from "./excalidrawPart"
import { SLIDE_COVER, canvasInsets, holdFrame, presentFrame, type FrameCamera } from "./presentFrame"

const frame = (id: string, width: number, height: number) => ({ id, type: "frame", x: 40, y: 80, width, height })
const NONE = { top: 0, right: 0, bottom: 0, left: 0 }

/** Excalidraw's camera on a canvas `width` x `height`, with the scene `elements`. */
function camera(width: number, height: number, elements = [frame("f1", 400, 300)]) {
  const scrollToContent = vi.fn()
  const api = { getSceneElements: () => elements, getAppState: () => ({ width, height }), scrollToContent } as unknown as FrameCamera
  return { api, scrollToContent, shown: () => scrollToContent.mock.lastCall?.[1] as Record<string, unknown> | undefined }
}

describe("presentFrame", () => {
  it("zooms a frame smaller than the canvas in, to cover the room on the axis that binds, and pins the zoom", () => {
    const c = camera(1000, 600)
    expect(presentFrame(c.api, "f1", NONE, false)).toBe(true)
    const zoom = (600 / 300) * SLIDE_COVER
    expect(c.scrollToContent).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }), {
      fitToViewport: true,
      viewportZoomFactor: SLIDE_COVER,
      canvasOffsets: NONE,
      minZoom: zoom,
      maxZoom: zoom,
      animate: false,
    })
    expect(zoom).toBeGreaterThan(1)
  })

  it("zooms a frame larger than the canvas out the same way, on a phone's narrow canvas", () => {
    const c = camera(390, 520, [frame("f1", 1200, 900)])
    presentFrame(c.api, "f1", NONE, true)
    const zoom = (390 / 1200) * SLIDE_COVER
    expect(c.shown()).toMatchObject({ minZoom: zoom, maxZoom: zoom, animate: true })
  })

  it("fits the slide to the room the insets leave free, and hands Excalidraw the insets to centre it there", () => {
    const insets = { top: 60, right: 0, bottom: 40, left: 0 }
    const c = camera(1000, 600)
    presentFrame(c.api, "f1", insets, false)
    const zoom = ((600 - 60 - 40) / 300) * SLIDE_COVER
    expect(c.shown()).toMatchObject({ canvasOffsets: insets, minZoom: zoom, maxZoom: zoom })
    const sides = { top: 0, right: 300, bottom: 0, left: 100 }
    presentFrame(c.api, "f1", sides, false)
    expect(c.shown()).toMatchObject({ minZoom: ((1000 - 400) / 400) * SLIDE_COVER })
  })

  it("does nothing, and says so, while the frame isn't on the scene", () => {
    const c = camera(1000, 600)
    expect(presentFrame(c.api, "f9", NONE, false)).toBe(false)
    expect(c.scrollToContent).not.toHaveBeenCalled()
  })

  it("leaves a canvas with no room yet to Excalidraw's own fit, unpinned", () => {
    for (const c of [camera(0, 0), camera(1000, 600, [frame("f1", 0, 0)])]) {
      expect(presentFrame(c.api, "f1", NONE, true)).toBe(true)
      expect(c.scrollToContent).toHaveBeenCalledWith(expect.objectContaining({ id: "f1" }), { fitToContent: true, animate: true })
    }
    const crowded = camera(1000, 600)
    presentFrame(crowded.api, "f1", { top: 400, right: 0, bottom: 300, left: 0 }, false)
    expect(crowded.shown()).toEqual({ fitToContent: true, animate: false })
  })
})

describe("canvasInsets", () => {
  const box = (top: number, height: number, width = 300) => ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top }) as DOMRect
  /** A board's frame: a pills bar over the canvas, then Excalidraw's container, which starts 100 px down the page. */
  function host(rects: Partial<Record<"canvas" | "toolRow" | "footer" | "zoom" | "pills", DOMRect>>) {
    const h = document.createElement("div")
    h.innerHTML = `<div data-board-bar="overlay"></div><div class="excalidraw"><div class="App-toolbar"></div><div class="App-bottom-bar"><div class="Island"></div></div><div class="layer-ui__wrapper__footer-left"><div class="Stack"><section></section></div></div></div>`
    const parts = { canvas: CONTAINER, toolRow: TOOL_ROW, footer: PHONE_FOOTER, zoom: ZOOM_CLUSTER, pills: "[data-board-bar]" }
    for (const [name, selector] of Object.entries(parts)) {
      const el = h.querySelector(selector)!
      expect(el, selector).toBeTruthy()
      el.getBoundingClientRect = () => rects[name as keyof typeof parts] ?? box(0, 0, 0)
    }
    return h
  }

  it("takes each part drawn over the canvas off the edge it sits nearer, measured from the canvas", () => {
    const h = host({ canvas: box(100, 600), toolRow: box(110, 48), pills: box(108, 32), zoom: box(650, 40), footer: box(600, 0) })
    expect(canvasInsets(h, "[data-board-bar]")).toEqual({ top: 58, right: 0, bottom: 50, left: 0 })
    // Without the caller's bar, only Excalidraw's own parts count, and one with no width or no height isn't drawn.
    expect(canvasInsets(host({ canvas: box(100, 600), pills: box(108, 120), toolRow: box(110, 48, 0), footer: box(600, 0) }))).toEqual(NONE)
  })

  it("takes a phone's footer off the foot, and nothing for parts not drawn or outside the canvas", () => {
    // On a phone the pills are a row above the canvas, and the tool row sits at its top.
    const h = host({ canvas: box(100, 500, 390), pills: box(56, 44, 390), toolRow: box(104, 52, 390), footer: box(548, 44, 390) })
    expect(canvasInsets(h, "[data-board-bar]")).toEqual({ top: 56, right: 0, bottom: 52, left: 0 })
  })

  it("takes nothing with no host, or before the canvas is laid out", () => {
    expect(canvasInsets(null)).toEqual(NONE)
    expect(canvasInsets(document.createElement("div"))).toEqual(NONE)
    expect(canvasInsets(host({ canvas: box(100, 0), toolRow: box(110, 48) }))).toEqual(NONE)
  })
})

describe("holdFrame", () => {
  afterEach(() => vi.unstubAllGlobals())
  const box = (top: number, height: number, width = 1000) => ({ top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top }) as DOMRect
  /**
   * A board's frame: its canvas and tool row where the test puts them, and
   * Excalidraw's size kept apart from the canvas's (it takes a new one in an
   * update of its own). The one ResizeObserver reports when the test says,
   * and the frames the hold asks for run a round at a time.
   */
  function stage() {
    const host = document.createElement("div")
    host.innerHTML = `<div class="excalidraw"><div class="App-toolbar"></div></div>`
    const canvas = host.querySelector(CONTAINER)!
    const tools = host.querySelector(TOOL_ROW)!
    const room = { canvas: box(0, 600), tools: box(10, 48), size: { width: 1000, height: 600 } }
    canvas.getBoundingClientRect = () => room.canvas
    tools.getBoundingClientRect = () => room.tools
    const c = camera(0, 0)
    ;(c.api as { getAppState: () => unknown }).getAppState = () => room.size
    const reports: (() => void)[] = []
    const watched = new Set<Element>()
    const disconnect = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(report: () => void) {
          reports.push(report)
        }
        observe(el: Element) {
          watched.add(el)
        }
        disconnect = disconnect
      },
    )
    const frames = new Map<number, FrameRequestCallback>()
    let next = 0
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => (frames.set(++next, f), next))
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id))
    return {
      ...c,
      host,
      canvas,
      tools,
      room,
      watched,
      disconnect,
      resized: () => reports.forEach((r) => r()),
      /** A report for `el` alone, as a ResizeObserver makes one only for what it observes. */
      report: (el: Element) => {
        if (watched.has(el)) reports.forEach((r) => r())
      },
      /** How many frames the hold has asked for and not yet had. */
      pending: () => frames.size,
      tick: () => {
        const now = [...frames.values()]
        frames.clear()
        now.forEach((f) => f(0))
      },
    }
  }
  /** The canvas becomes `height` tall from `top`, its tool row at its top, and Excalidraw takes that size when `taken`. */
  const move = (t: ReturnType<typeof stage>, top: number, height: number, taken = true) => {
    t.room.canvas = box(top, height)
    t.room.tools = box(top + 10, 48)
    if (taken) t.room.size = { width: 1000, height }
  }

  it("shows a frame as a slide and holds it: a change of room shows it again, at once, when Excalidraw has the canvas's size", () => {
    const t = stage()
    const h = holdFrame(t.api, t.host)
    expect(h.show("f1", true)).toBe(true)
    expect(t.shown()).toMatchObject({ canvasOffsets: { top: 58, bottom: 0 }, minZoom: ((600 - 58) / 300) * SLIDE_COVER, animate: true })
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    expect(t.watched).toEqual(new Set([t.canvas, t.tools]))
    // A row above the board wraps: the canvas starts 100 px lower, 100 px shorter, and Excalidraw still has the old size.
    move(t, 100, 500, false)
    t.resized()
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    t.room.size = { width: 1000, height: 500 }
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(2)
    expect(t.shown()).toMatchObject({ canvasOffsets: { top: 58 }, minZoom: ((500 - 58) / 300) * SLIDE_COVER, animate: false })
    // A part drawn since (a phone's footer) is watched, and the slide keeps clear of it.
    t.canvas.insertAdjacentHTML("beforeend", `<div class="App-bottom-bar"><div class="Island"></div></div>`)
    const footer = t.host.querySelector(PHONE_FOOTER)!
    footer.getBoundingClientRect = () => box(556, 44)
    t.resized()
    t.tick()
    expect(t.watched.has(footer)).toBe(true)
    expect(t.shown()).toMatchObject({ canvasOffsets: { top: 58, bottom: 44 }, minZoom: ((500 - 58 - 44) / 300) * SLIDE_COVER })
    // A report with nothing changed moves nothing.
    t.resized()
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(3)
  })

  it("shows a frame again once Excalidraw takes the size the canvas had already taken when it was shown", () => {
    const t = stage()
    move(t, 100, 500, false)
    holdFrame(t.api, t.host).show("f1", false)
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    t.room.size = { width: 1000, height: 500 }
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(2)
    expect(t.shown()).toMatchObject({ minZoom: ((500 - 58) / 300) * SLIDE_COVER, animate: false })
  })

  it("leaves the camera to a person who moves it on the canvas, until the frame is shown again", () => {
    for (const type of ["pointerdown", "wheel", "keydown"]) {
      const t = stage()
      const h = holdFrame(t.api, t.host)
      h.show("f1", false)
      t.tick()
      t.tools.dispatchEvent(new Event(type))
      move(t, 0, 500)
      t.resized()
      t.tick()
      expect(t.scrollToContent, type).toHaveBeenCalledTimes(1)
      h.show("f1", true)
      move(t, 0, 400)
      t.resized()
      t.tick()
      expect(t.scrollToContent, type).toHaveBeenCalledTimes(3)
      expect(t.shown(), type).toMatchObject({ animate: false })
      h.stop()
    }
  })

  it("lets the camera go when dropped, and stops watching when stopped", () => {
    const t = stage()
    const h = holdFrame(t.api, t.host)
    h.show("f1", false)
    h.drop()
    move(t, 0, 500)
    t.resized()
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    h.show("f1", false)
    h.stop()
    expect(t.disconnect).toHaveBeenCalled()
    move(t, 0, 400)
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(2)
  })

  it("holds no frame that isn't on the scene, and shows frames without a host, holding nothing", () => {
    const t = stage()
    expect(holdFrame(t.api, t.host).show("f9", false)).toBe(false)
    move(t, 0, 500)
    t.resized()
    t.tick()
    expect(t.scrollToContent).not.toHaveBeenCalled()
    const c = camera(1000, 600)
    expect(holdFrame(c.api, null).show("f1", false)).toBe(true)
    expect(c.shown()).toMatchObject({ canvasOffsets: NONE, animate: false })
  })

  it("stops waiting for Excalidraw to take the canvas's size within a second of frames, and shows the frame again at the next change", () => {
    const t = stage()
    move(t, 100, 500, false)
    holdFrame(t.api, t.host).show("f1", false)
    // Excalidraw never takes the size: the hold looks again a frame at a time, then asks for no more frames.
    let looks = 0
    for (; t.pending() > 0 && looks < 600; looks++) t.tick()
    expect(t.pending()).toBe(0)
    expect(looks).toBeGreaterThan(1)
    expect(looks).toBeLessThanOrEqual(60)
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    // Taken later with no change reported, the size moves nothing; the next report shows the frame again in it.
    t.room.size = { width: 1000, height: 500 }
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(1)
    t.resized()
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(2)
    expect(t.shown()).toMatchObject({ minZoom: ((500 - 58) / 300) * SLIDE_COVER, animate: false })
  })

  it("watches the caller's bar over the canvas, and shows the frame again clear of it when the bar alone grows", () => {
    const t = stage()
    t.host.insertAdjacentHTML("afterbegin", `<div data-board-bar="overlay"></div>`)
    const bar = t.host.querySelector("[data-board-bar]")!
    let barBox = box(560, 40)
    bar.getBoundingClientRect = () => barBox
    const h = holdFrame(t.api, t.host, "[data-board-bar]")
    h.show("f1", false)
    t.tick()
    expect(t.shown()).toMatchObject({ canvasOffsets: { top: 58, bottom: 40 } })
    expect(t.watched.has(bar)).toBe(true)
    // A second row of pills: only the bar's own observer reports.
    barBox = box(520, 80)
    t.report(bar)
    t.tick()
    expect(t.scrollToContent).toHaveBeenCalledTimes(2)
    expect(t.shown()).toMatchObject({ canvasOffsets: { top: 58, bottom: 80 }, minZoom: ((600 - 58 - 80) / 300) * SLIDE_COVER, animate: false })
    h.stop()
  })
})
