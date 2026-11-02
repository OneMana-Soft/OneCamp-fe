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
