import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CAMP_HUES } from "@/lib/campHue"
import { celebrate, springPop } from "@/lib/celebrate"

/**
 * The celebration is decoration, so it must be safe: nothing at all for
 * someone who asked for reduced motion, a short burst otherwise, and nothing
 * left behind in the page.
 */

type Call = { keyframes: Keyframe[]; options: KeyframeAnimationOptions; el: Element }
let calls: Call[] = []

function motion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  calls = []
  Element.prototype.animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ keyframes, options, el: this })
    return { finished: Promise.resolve() } as unknown as Animation
  }) as unknown as typeof Element.prototype.animate
})

afterEach(() => {
  delete (Element.prototype as Partial<Element>).animate
  document.body.innerHTML = ""
  vi.useRealTimers()
})

function target(): HTMLElement {
  const el = document.createElement("button")
  el.getBoundingClientRect = () => ({ left: 100, top: 40, width: 20, height: 20, right: 120, bottom: 60, x: 100, y: 40, toJSON() {} }) as DOMRect
  document.body.appendChild(el)
  return el
}

describe("celebrate", () => {
  it("does nothing at all with reduced motion", () => {
    motion(true)
    const el = target()
    const before = document.body.children.length
    expect(celebrate(el)).toBe(0)
    expect(document.body.children.length).toBe(before)
    expect(document.querySelector("[data-celebrate]")).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("bursts 6 to 10 camp-hued sparks from the element's middle, in 300 to 500 ms", () => {
    motion(false)
    expect(celebrate(target())).toBe(8)
    const layer = document.querySelector<HTMLElement>("[data-celebrate]")!
    expect(layer.getAttribute("aria-hidden")).toBe("true")
    expect(layer.style.left).toBe("110px")
    expect(layer.style.top).toBe("50px")
    expect(layer.style.pointerEvents).toBe("none")
    expect(calls).toHaveLength(8)
    for (const c of calls) {
      expect(c.options.duration).toBeGreaterThanOrEqual(300)
      expect(c.options.duration).toBeLessThanOrEqual(500)
    }
    const fills = [...layer.querySelectorAll("svg")].map((s) => (s as SVGElement).style.fill)
    expect(new Set(fills).size).toBe(6)
    for (const f of fills) expect(CAMP_HUES.some((h) => f.includes(`--camp-${h}`))).toBe(true)
  })

  it("keeps the count within 6 to 10", () => {
    motion(false)
    expect(celebrate(target(), { count: 2 })).toBe(6)
    expect(celebrate(target(), { count: 40 })).toBe(10)
  })

  it("leaves nothing behind once the sparks land", async () => {
    motion(false)
    celebrate(target())
    await new Promise((r) => setTimeout(r, 0))
    expect(document.querySelector("[data-celebrate]")).toBeNull()
  })

  it("does nothing without an element or without Web Animations", () => {
    motion(false)
    expect(celebrate(null)).toBe(0)
    delete (Element.prototype as Partial<Element>).animate
    expect(celebrate(target())).toBe(0)
    expect(document.querySelector("[data-celebrate]")).toBeNull()
  })
})

describe("springPop", () => {
  it("bounces 1 to 1.12 and back in 220 ms", () => {
    motion(false)
    expect(springPop(target())).not.toBeNull()
    expect(calls[0].options.duration).toBe(220)
    expect(calls[0].keyframes.map((k) => k.scale)).toEqual(["1", "1.12", "1"])
  })

  it("stands still with reduced motion", () => {
    motion(true)
    expect(springPop(target())).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
