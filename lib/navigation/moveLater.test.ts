import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { moveLater } from "./moveLater"

// A move the page makes by itself never pulls the person from a move of their
// own (e2e/githubCallbackLeave.spec.ts shows the admin pulled back).

describe("moveLater", () => {
  let stop = () => {}
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    stop()
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("moves once, the wait after go", () => {
    const move = vi.fn()
    const later = moveLater(move, vi.fn())
    stop = later.stop
    later.go(2000)
    vi.advanceTimersByTime(1999)
    expect(move).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(move).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(5000)
    expect(move).toHaveBeenCalledTimes(1)
  })

  for (const [what, act] of [
    ["a press", () => document.body.appendChild(document.createElement("a")).dispatchEvent(new Event("pointerdown", { bubbles: true }))],
    ["a key, even a plain one", () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))],
    ["Back or Forward", () => dispatchEvent(new PopStateEvent("popstate"))],
  ] as const) {
    it(`never moves after ${what}, and says they moved, once`, () => {
      const move = vi.fn()
      const theyMoved = vi.fn()
      const later = moveLater(move, theyMoved)
      stop = later.stop
      later.go(2000)
      act()
      act()
      vi.advanceTimersByTime(5000)
      expect(move).not.toHaveBeenCalled()
      expect(theyMoved).toHaveBeenCalledTimes(1)
    })
  }

  it("counts a move made before go (a press while the page was still connecting)", () => {
    const move = vi.fn()
    const theyMoved = vi.fn()
    const later = moveLater(move, theyMoved)
    stop = later.stop
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    later.go(2000)
    vi.advanceTimersByTime(5000)
    expect(move).not.toHaveBeenCalled()
    expect(theyMoved).toHaveBeenCalledTimes(1)
  })

  it("does nothing once stopped (the page gone), a press after it included", () => {
    const move = vi.fn()
    const theyMoved = vi.fn()
    const later = moveLater(move, theyMoved)
    later.go(2000)
    later.stop()
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    vi.advanceTimersByTime(5000)
    later.go(10)
    vi.advanceTimersByTime(100)
    expect(move).not.toHaveBeenCalled()
    expect(theyMoved).not.toHaveBeenCalled()
  })
})
