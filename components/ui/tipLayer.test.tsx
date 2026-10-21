import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"

import TipLayer, { delayOf, placementOf, positionTip } from "./tipLayer"
import { listenForEscape } from "@/lib/keys/escape"

// The page's one label chip for every data-tip (components/ui/tipLayer.tsx):
// where it goes, when, and when it goes away. e2e/cssTips.spec.ts measures it
// whole in a browser, where each label was its control's ::after and was cut.

const el = (cls: string) => Object.assign(document.createElement("button"), { className: cls })
const chip = () => document.body.querySelector<HTMLElement>("[data-tip-layer]")

describe("where a label goes", () => {
  it("reads its side, alignment and width from the markers", () => {
    expect(placementOf(el("work-tip"))).toEqual({ side: "top", align: "center", wide: false })
    expect(placementOf(el("relative"))).toEqual({ side: "bottom", align: "center", wide: false })
    expect(placementOf(el("relative tip-above tip-end"))).toEqual({ side: "top", align: "end", wide: false })
    expect(placementOf(el("relative tip-time tip-start"))).toEqual({ side: "bottom", align: "start", wide: false })
    expect(placementOf(el("work-tip tip-wide"))).toEqual({ side: "top", align: "center", wide: true })
    expect(delayOf(el("work-tip"))).toBe(400)
    expect(delayOf(el("relative"))).toBe(200)
  })

  it("sits on its side, flips when the window has no room there, and keeps 8 px inside the window", () => {
    const view = { width: 1000, height: 800 }
    const size = { width: 100, height: 24 }
    const mid = { left: 450, right: 470, top: 400, bottom: 420 }
    expect(positionTip(mid, size, { side: "top", align: "center", wide: false }, view)).toEqual({ left: 410, top: 370, side: "top" })
    expect(positionTip(mid, size, { side: "bottom", align: "end", wide: false }, view)).toEqual({ left: 370, top: 426, side: "bottom" })
    // A column header at the top: below instead.
    expect(positionTip({ left: 450, right: 470, top: 10, bottom: 30 }, size, { side: "top", align: "center", wide: false }, view).side).toBe("bottom")
    // A row at the foot: above instead.
    expect(positionTip({ left: 450, right: 470, top: 770, bottom: 790 }, size, { side: "bottom", align: "center", wide: false }, view).side).toBe("top")
    // A glyph at the window's start: held in, not cut.
    expect(positionTip({ left: 2, right: 18, top: 400, bottom: 420 }, size, { side: "top", align: "center", wide: false }, view).left).toBe(8)
    expect(positionTip({ left: 990, right: 1000, top: 400, bottom: 420 }, size, { side: "top", align: "center", wide: false }, view).left).toBe(892)
  })
})

describe("the chip", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    document.body.innerHTML = ""
  })

  // jsdom's pointer events carry no pointerType: it is set on the event here.
  const hover = (target: Element, pointerType = "mouse") =>
    act(() => {
      const e = new MouseEvent("pointerover", { bubbles: true })
      Object.defineProperty(e, "pointerType", { value: pointerType })
      target.dispatchEvent(e)
    })
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it("shows a work-tip after 400 ms under the pointer, at the page's end, and goes when the pointer leaves", () => {
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <span className="work-tip" data-tip="To do">
          <svg data-testid="glyph" />
        </span>
        <p>elsewhere</p>
      </div>,
    )
    render(<TipLayer />)
    const tip = container.querySelector(".work-tip")!
    hover(tip.querySelector("svg")!)
    wait(399)
    expect(chip()).toBeNull()
    wait(1)
    expect(chip()?.textContent).toBe("To do")
    expect(container.contains(chip())).toBe(false)
    expect(chip()?.getAttribute("aria-hidden")).toBe("true")
    act(() => void fireEvent.pointerOut(tip, { relatedTarget: container.querySelector("p"), bubbles: true }))
    expect(chip()).toBeNull()
  })

  it("shows a toolbar label after 200 ms, at once with keyboard focus, never for a finger, an empty tip, or a control whose menu is open", () => {
    const { container } = render(
      <div>
        <button className="relative" data-tip="Reply in thread">r</button>
        <button className="relative tip-above" data-tip="Add" data-state="open">a</button>
        <button className="work-tip" data-tip="">c</button>
      </div>,
    )
    render(<TipLayer />)
    const [reply, open, empty] = Array.from(container.querySelectorAll("button"))
    hover(reply, "touch")
    wait(500)
    expect(chip()).toBeNull()
    hover(reply)
    wait(200)
    expect(chip()?.textContent).toBe("Reply in thread")
    act(() => void fireEvent.pointerDown(reply, { bubbles: true }))
    expect(chip()).toBeNull()
    hover(open)
    wait(500)
    expect(chip()).toBeNull()
    hover(empty)
    wait(500)
    expect(chip()).toBeNull()
    // Keyboard focus (jsdom has no :focus-visible; it is the browser's to say).
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, s: string) {
      return s === ":focus-visible" ? this === reply : matches.call(this, s)
    })
    act(() => void fireEvent.focusIn(reply))
    expect(chip()?.textContent).toBe("Reply in thread")
    // Escape, through the one Escape (lib/keys/escape), as the root providers start it.
    const stop = listenForEscape()
    act(() => void fireEvent.keyDown(reply, { key: "Escape", bubbles: true }))
    expect(chip()).toBeNull()
    stop?.()
  })

  it("shows a time label while its row's keyboard stop has the focus", () => {
    const { container } = render(
      <div className="group/name">
        <button>Maya Chen</button>
        <time className="relative tip-time" data-tip="Friday 10 October 2026 at 09:01">09:01</time>
      </div>,
    )
    render(<TipLayer />)
    const name = container.querySelector("button")!
    const matches = Element.prototype.matches
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, s: string) {
      return s === ":focus-visible" ? this === name : matches.call(this, s)
    })
    act(() => void fireEvent.focusIn(name))
    expect(chip()?.textContent).toBe("Friday 10 October 2026 at 09:01")
    act(() => void fireEvent.focusOut(name))
    expect(chip()).toBeNull()
  })
})
