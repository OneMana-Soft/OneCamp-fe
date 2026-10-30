import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { useRef } from "react"
import { fromFoot, useRootPlace } from "./rootPlace"

// The app's toasts keep clear of a call's dock and side column through
// variables the call keeps on the page's root (components/ui/toast.tsx): a
// notice covered the call chat's held line at 1280 (DESIGN-BUILD-18, 26 Oct).
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

const NAME = "--call-stage-right"
const read = () => document.documentElement.style.getPropertyValue(NAME)
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true })

const stageRight = (box: DOMRect) => window.innerWidth - box.right

// A stage whose tiles end at `right` (jsdom lays nothing out, so the box is said here).
function Stage({ right, layout }: { right: number; layout?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useRootPlace(NAME, ref, stageRight, layout)
  return <div ref={ref} data-right={right} />
}

// A call whose top row ends 40px under its top, drawn `top` from the window's top.
const TOP = "--call-top"
function Call({ top }: { top: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useRootPlace(TOP, ref, (box) => box.top + 40)
  return <div ref={ref} data-top={top} />
}

// Under a hidden element nothing is drawn: no boxes, and a box of zeros.
const drawn = (el: Element) => !el.closest("[hidden]")

describe("a call's place on the page's root, for the toasts", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", WatchSize)
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (!drawn(this)) return { right: 0, width: 0, height: 0 } as DOMRect
      const at = (this as HTMLElement).dataset
      return { top: Number(at.top ?? 0), right: Number(at.right ?? 0), width: 640, height: 480 } as DOMRect
    })
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      return (drawn(this) ? [this.getBoundingClientRect()] : []) as unknown as DOMRectList
    })
    setWidth(1280)
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("follows the stage's edge as a side column opens and the window changes, and goes with the call", () => {
    const { container, unmount } = render(<Stage right={1280} />)
    expect(read()).toBe("0px")

    // People opens: the tiles now end 360px from the window's edge.
    ;(container.firstChild as HTMLElement).dataset.right = "920"
    act(() => resized?.())
    expect(read()).toBe("360px")

    setWidth(1440)
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(read()).toBe("520px")

    unmount()
    expect(read()).toBe("")
  })

  it("lets go while the stage isn't drawn, as beside a focused conversation, and takes it up again when it shows", () => {
    const { container } = render(<Stage right={920} />)
    expect(read()).toBe("360px")

    // Focusing the conversation hides the call, which runs on (MeetingSplit):
    // read from its box of zeros, the place put every toast off screen.
    container.hidden = true
    act(() => resized?.())
    expect(read()).toBe("")
    act(() => {
      window.dispatchEvent(new Event("resize"))
    })
    expect(read()).toBe("")

    container.hidden = false
    act(() => resized?.())
    expect(read()).toBe("360px")
  })

  // On a phone a call's own page scrolls in the app's scroller, and nothing
  // changes size as it does: the place follows any scroll on the page, so a
  // call whose top has gone up under the bar gives the toasts the bar's slot
  // (app/phone.css C9 takes the lower of the two).
  it("follows the element as anything on the page scrolls, and stops when it goes", () => {
    const readTop = () => document.documentElement.style.getPropertyValue(TOP)
    const scroller = document.body.appendChild(document.createElement("div"))
    const { container, unmount } = render(<Call top={150} />)
    expect(readTop()).toBe("190px")

    ;(container.firstChild as HTMLElement).dataset.top = "-60"
    act(() => {
      scroller.dispatchEvent(new Event("scroll"))
    })
    expect(readTop()).toBe("0px")

    unmount()
    act(() => {
      scroller.dispatchEvent(new Event("scroll"))
    })
    expect(readTop()).toBe("")
    scroller.remove()
  })

  it("measures again when the stage changes layout", () => {
    const { rerender } = render(<Stage right={1000} layout="grid" />)
    expect(read()).toBe("280px")
    rerender(<Stage right={900} layout="speaker" />)
    expect(read()).toBe("380px")
  })

  // A sheet rising from the screen's foot carries what's in it with a transform: nothing resizes or scrolls, so
  // the place is measured again when the rise (an animation, or a transition) ends, and only for what it carried
  // (asana-12 (a): the task sheet's comment box, measured below the screen as it mounted, hid the offline pill).
  it("follows the element once whatever carried it into place has arrived, and only that", () => {
    const readTop = () => document.documentElement.style.getPropertyValue(TOP)
    const other = document.body.appendChild(document.createElement("div"))
    const { container } = render(
      <div data-sheet="">
        <Call top={900} />
      </div>,
    )
    const sheet = container.firstChild as HTMLElement
    const call = sheet.firstChild as HTMLElement
    expect(readTop()).toBe("940px")

    call.dataset.top = "150"
    act(() => {
      other.dispatchEvent(new Event("animationend", { bubbles: true }))
    })
    expect(readTop()).toBe("940px")
    act(() => {
      sheet.dispatchEvent(new Event("animationend", { bubbles: true }))
    })
    expect(readTop()).toBe("190px")

    call.dataset.top = "300"
    act(() => {
      sheet.dispatchEvent(new Event("transitionend", { bubbles: true }))
    })
    expect(readTop()).toBe("340px")
    other.remove()
  })

  // The keyboard fitting the app's frame (lib/ui/visualViewport writes data-keyboard on <html>) moves what stands on
  // it, a sheet and its comment box (app/phone.css C5c, C5d), and nothing resizes or scrolls: the place is measured
  // again each time the frame fits or lets go (asana-12 (a): with the keyboard up, the offline pill stayed at the old
  // floor, 328px under the task sheet's comment box).
  it("follows the element as the keyboard fits the app's frame and lets it go, and stops when it goes", async () => {
    const FOOT = "--mobile-drawer-h"
    const readFoot = () => document.documentElement.style.getPropertyValue(FOOT)
    const root = document.documentElement
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true })
    function Box({ top }: { top: number }) {
      const ref = useRef<HTMLDivElement>(null)
      useRootPlace(FOOT, ref, fromFoot)
      return <div ref={ref} data-top={top} />
    }
    const { container, unmount } = render(<Box top={760} />)
    const box = container.firstChild as HTMLElement
    expect(readFoot()).toBe("84px")

    // The keyboard comes up, 336px: the box stands on it.
    box.dataset.top = "424"
    await act(async () => root.setAttribute("data-keyboard", "open"))
    expect(readFoot()).toBe("420px")

    // iOS pans to the caret: the fit is written again, the mark as it was.
    box.dataset.top = "400"
    await act(async () => root.setAttribute("data-keyboard", "open"))
    expect(readFoot()).toBe("444px")

    // The keyboard goes: the box is back on the screen's foot.
    box.dataset.top = "760"
    await act(async () => root.removeAttribute("data-keyboard"))
    expect(readFoot()).toBe("84px")

    unmount()
    expect(readFoot()).toBe("")
    await act(async () => root.setAttribute("data-keyboard", "open"))
    expect(readFoot()).toBe("")
    root.removeAttribute("data-keyboard")
  })

  // A motion that carries the element (the task sheet's 420ms rise, a transform) moves it with no resize or scroll:
  // the place is measured on every frame while it runs, so what stands on it moves with it (V-93: the offline pill
  // stood over the sheet's comment box for ~240ms of the rise, then hopped 82px). A looping motion carries nothing
  // anywhere, and a motion elsewhere moves nothing.
  it("follows the element on every frame while a motion carries it, and stops when the motion ends or it goes", () => {
    const FOOT = "--mobile-drawer-h"
    const readFoot = () => document.documentElement.style.getPropertyValue(FOOT)
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true })
    let queued = new Map<number, FrameRequestCallback>()
    let id = 0
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => (queued.set(++id, cb), id))
    vi.stubGlobal("cancelAnimationFrame", (n: number) => queued.delete(n))
    const frame = () => {
      const run = [...queued.values()]
      queued = new Map()
      act(() => run.forEach((cb) => cb(0)))
    }
    const motion = (target: Element, endTime: number) => ({ playState: "running", effect: { target, getComputedTiming: () => ({ endTime }) } })
    let running: ReturnType<typeof motion>[] = []
    Object.defineProperty(document, "getAnimations", { value: () => running, configurable: true })
    function Box({ top }: { top: number }) {
      const ref = useRef<HTMLDivElement>(null)
      useRootPlace(FOOT, ref, fromFoot)
      return <div ref={ref} data-top={top} />
    }
    const sheet = document.body.appendChild(document.createElement("div"))
    const elsewhere = document.body.appendChild(document.createElement("div"))

    // The sheet's content comes mid-rise: the box mounts while the rise carries it, and moves with it frame by frame.
    running = [motion(sheet, 420)]
    const { unmount } = render(<Box top={783} />, { container: sheet })
    const box = sheet.firstChild as HTMLElement
    expect(readFoot()).toBe("61px")
    box.dataset.top = "752"
    frame()
    expect(readFoot()).toBe("92px")
    box.dataset.top = "720"
    frame()
    expect(readFoot()).toBe("124px")

    // The rise ends; a breath that loops on the sheet and a motion elsewhere don't keep it measuring.
    running = [motion(sheet, Infinity), motion(elsewhere, 300)]
    box.dataset.top = "701"
    frame()
    expect(readFoot()).toBe("143px")
    expect(queued.size).toBe(0)

    // A motion that starts later (the sheet's close) is followed from its start.
    running = [motion(sheet, 300)]
    box.dataset.top = "760"
    act(() => {
      elsewhere.dispatchEvent(new Event("animationstart", { bubbles: true }))
    })
    expect(queued.size).toBe(0)
    act(() => {
      sheet.dispatchEvent(new Event("transitionstart", { bubbles: true }))
    })
    frame()
    expect(readFoot()).toBe("84px")

    // It goes mid-motion: nothing is measured or written after.
    unmount()
    expect(readFoot()).toBe("")
    frame()
    expect(readFoot()).toBe("")
    sheet.remove()
    elsewhere.remove()
    Reflect.deleteProperty(document, "getAnimations")
  })
})
