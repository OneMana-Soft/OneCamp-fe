import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { useClaimTouches } from "./useClaimTouches"

// An ink layer keeps a finger's touches while you draw, so the browser makes no fling of a quick stroke and the next
// tap still clicks (V-207). Two fingers are a pinch and stay the browser's, and so does a touch anywhere else, or on
// the layer once you stop. Headless Chromium makes no zoom of a synthesized pinch, so the call's e2e can't show the
// pinch: this file pins it.

function Layer({ on }: { on: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useClaimTouches(ref, on)
  return (
    <div data-testid="around">
      <div data-testid="layer" ref={ref}>
        <span data-testid="stroke" />
      </div>
      <div data-testid="beside" />
    </div>
  )
}

// A touch event with `fingers` on the screen. jsdom has no Touch, so `touches` stands in as a list of that length.
const touch = (el: Element, type: "touchstart" | "touchmove" | "touchend", fingers = 1) => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(e, "touches", { value: { length: fingers } })
  el.dispatchEvent(e)
  return e.defaultPrevented
}

// The layer's own touch listeners, from a spy on addEventListener or removeEventListener.
const layerTouches = (spy: { mock: { calls: unknown[][]; contexts: unknown[] } }, layer: Element) =>
  spy.mock.calls.filter(([type], i) => spy.mock.contexts[i] === layer && (type === "touchstart" || type === "touchmove"))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("useClaimTouches", () => {
  it("keeps one finger's touchstart and touchmove on the layer while on, with listeners that may prevent the default", () => {
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener")
    render(<Layer on />)
    const layer = screen.getByTestId("layer")
    expect(touch(layer, "touchstart")).toBe(true)
    expect(touch(layer, "touchmove")).toBe(true)
    // A finger that lands on a stroke is on the layer too.
    expect(touch(screen.getByTestId("stroke"), "touchstart")).toBe(true)
    // React listens at its root too: only the layer's own listeners count.
    expect(layerTouches(add, layer).map(([type, , options]) => [type, options])).toEqual([
      ["touchstart", { passive: false }],
      ["touchmove", { passive: false }],
    ])
  })

  it("leaves two fingers to the browser: a pinch on the layer is never claimed, and one finger after it is again", () => {
    render(<Layer on />)
    const layer = screen.getByTestId("layer")
    expect(touch(layer, "touchstart", 2)).toBe(false)
    expect(touch(layer, "touchmove", 2)).toBe(false)
    expect(touch(screen.getByTestId("stroke"), "touchmove", 3)).toBe(false)
    expect(touch(layer, "touchstart")).toBe(true)
  })

  it("leaves the lift, and every touch outside the layer: beside it and around it", () => {
    render(<Layer on />)
    expect(touch(screen.getByTestId("layer"), "touchend")).toBe(false)
    for (const id of ["beside", "around"]) {
      expect(touch(screen.getByTestId(id), "touchstart"), id).toBe(false)
      expect(touch(screen.getByTestId(id), "touchmove"), id).toBe(false)
    }
  })

  it("lets go when drawing ends: its listeners come off, and the layer's touches are the browser's until you draw again", () => {
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener")
    const { rerender } = render(<Layer on />)
    const layer = screen.getByTestId("layer")
    rerender(<Layer on={false} />)
    expect(layerTouches(remove, layer).map(([type]) => type)).toEqual(["touchstart", "touchmove"])
    expect(touch(layer, "touchstart")).toBe(false)
    expect(touch(layer, "touchmove")).toBe(false)
    rerender(<Layer on />)
    expect(touch(layer, "touchstart")).toBe(true)
  })

  it("takes its listeners away when the layer goes", () => {
    const remove = vi.spyOn(HTMLElement.prototype, "removeEventListener")
    const { unmount } = render(<Layer on />)
    const layer = screen.getByTestId("layer")
    unmount()
    expect(layerTouches(remove, layer).map(([type]) => type)).toEqual(["touchstart", "touchmove"])
  })
})
