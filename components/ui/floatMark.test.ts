import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useFloatRef } from "./floatMark"

// jsdom has no Web Animations, so each case lists the page's animations the way a browser's document.getAnimations() does.
function moving(target: Element, keyframes: Keyframe[], pseudoElement: string | null = null) {
  return {
    finish: vi.fn(),
    playState: "running",
    timeline: document.timeline,
    effect: { target, pseudoElement, getComputedTiming: () => ({ endTime: 200 }), getKeyframes: () => keyframes },
  }
}

describe("a float placed in a box still moving in", () => {
  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(document, "getAnimations")
    document.body.replaceChildren()
  })

  it("has the box arrive first, leaves a fade alone, and lets a theme switch's view transition run (V-349)", () => {
    const dialog = document.body.appendChild(document.createElement("div"))
    const float = dialog.appendChild(document.createElement("div"))
    const growIn = moving(dialog, [{ opacity: 0, transform: "scale(0.95)" }, { opacity: 1, transform: "none" }])
    const fade = moving(dialog, [{ opacity: 0 }, { opacity: 1 }])
    // A theme switch's ::view-transition-group(root) is listed on <html>, which holds every float, and moves by
    // transform; a pseudo-element's transform never makes its element hold a fixed float.
    const themeSwitch = moving(document.documentElement, [{ transform: "scale(0.98)" }, { transform: "none" }], "::view-transition-group(root)")
    Object.defineProperty(document, "getAnimations", { configurable: true, value: () => [growIn, fade, themeSwitch] })
    const { result } = renderHook(() => useFloatRef<HTMLDivElement>(null))
    const unmount = result.current(float)
    expect(growIn.finish).toHaveBeenCalledOnce()
    expect(fade.finish).not.toHaveBeenCalled()
    expect(themeSwitch.finish).not.toHaveBeenCalled()
    if (typeof unmount === "function") unmount()
  })
})

// V-940: a toast said as a held menu closes came in under the top bar, as over an open float, and jumped to the foot
// when the menu's exit ended. The page's mark says "closing" from the moment every float up has begun to leave
// (Radix's data-state="closed"), so the toast's slot is picked as the float ends, and the mark itself stays until the
// last one goes, for the scrim and the tap outside (app/overlay.css 8, app/phone.css C5).
describe("the page's float mark, while a float leaves", () => {
  const mark = () => document.documentElement.getAttribute("data-float")
  const float = (state: string) => {
    const node = document.createElement("div")
    node.dataset.state = state
    return node
  }
  const settle = () => new Promise((done) => setTimeout(done))
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute("data-float")
    document.body.replaceChildren()
  })

  it("is open while a float is open, closing once it has begun to leave, and goes when it unmounts", async () => {
    const { result } = renderHook(() => useFloatRef<HTMLDivElement>(null))
    const menu = document.body.appendChild(float("open"))
    const off = result.current(menu) as unknown as () => void
    expect(mark()).toBe("open")
    menu.dataset.state = "closed"
    await settle()
    expect(mark()).toBe("closing")
    off()
    expect(mark()).toBeNull()
    menu.dataset.state = "open"
    await settle()
    expect(mark(), "its observer went with it: a state it flips after is not read").toBeNull()
  })

  it("stays open while another float is open, or one comes as the last leaves", async () => {
    const { result } = renderHook(() => useFloatRef<HTMLDivElement>(null))
    const menu = document.body.appendChild(float("open"))
    const sub = document.body.appendChild(float("open"))
    const offMenu = result.current(menu) as unknown as () => void
    const offSub = result.current(sub) as unknown as () => void
    sub.dataset.state = "closed"
    await settle()
    expect(mark()).toBe("open")
    menu.dataset.state = "closed"
    await settle()
    expect(mark()).toBe("closing")
    const next = document.body.appendChild(float("open"))
    const offNext = result.current(next) as unknown as () => void
    expect(mark()).toBe("open")
    offSub()
    offMenu()
    expect(mark()).toBe("open")
    offNext()
    expect(mark()).toBeNull()
  })
})
