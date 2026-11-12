import { afterEach, describe, expect, it, vi } from "vitest"
import { listenTouches } from "./touches"

const TYPES = ["touchstart", "touchmove", "touchend", "touchcancel"]
const fire = (el: Element) => TYPES.forEach((type) => el.dispatchEvent(new Event(type, { cancelable: true })))
const added = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([type, , o]) => [type, (o as AddEventListenerOptions).passive])

afterEach(() => vi.restoreAllMocks())

describe("listenTouches", () => {
  it("hears a finger's start, move and end (or cancel), with only the move able to keep the page from scrolling, and lets go of them all", () => {
    const el = document.createElement("div")
    const add = vi.spyOn(el, "addEventListener")
    const on = { start: vi.fn(), move: vi.fn(), end: vi.fn() }
    const off = listenTouches(el, on)
    expect(added(add)).toEqual([
      ["touchstart", true],
      ["touchmove", false],
      ["touchend", true],
      ["touchcancel", true],
    ])
    fire(el)
    expect([on.start, on.move, on.end].map((f) => f.mock.calls.length)).toEqual([1, 1, 2])
    off()
    fire(el)
    expect([on.start, on.move, on.end].map((f) => f.mock.calls.length)).toEqual([1, 1, 2])
  })

  it("holds the start too when asked (a surface that keeps every finger's touch), and listens for nothing it isn't given", () => {
    const el = document.createElement("div")
    const add = vi.spyOn(el, "addEventListener")
    const start = vi.fn((e: Event) => e.preventDefault())
    listenTouches(el, { start }, true)
    expect(added(add)).toEqual([["touchstart", false]])
    const e = new Event("touchstart", { cancelable: true })
    el.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })
})
