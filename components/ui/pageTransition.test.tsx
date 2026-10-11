import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

let path = "/app/home"
vi.mock("next/navigation", () => ({ usePathname: () => path }))

import { PageTransition, shouldCrossfade } from "./PageTransition"

afterEach(cleanup)

describe("the sheet's route crossfade", () => {
  it("runs after a click, not after a key, and never under reduced motion", () => {
    expect(shouldCrossfade({ kind: "pointer", at: 1000 }, 1200, false)).toBe(true)
    expect(shouldCrossfade({ kind: "key", at: 1000 }, 1200, false)).toBe(false)
    expect(shouldCrossfade({ kind: "pointer", at: 1000 }, 1200, true)).toBe(false)
    expect(shouldCrossfade({ kind: "pointer", at: 1000 }, 5000, false)).toBe(false)
  })

  it("fades the new page up from .6 on opacity alone, enter only", () => {
    const animate = vi.fn()
    Element.prototype.animate = animate as unknown as Element["animate"]
    path = "/app/home"
    const view = render(<PageTransition><p>home</p></PageTransition>)
    expect(animate).not.toHaveBeenCalled()
    fireEvent.pointerDown(window)
    path = "/app/inbox"
    view.rerender(<PageTransition><p>inbox</p></PageTransition>)
    expect(animate).toHaveBeenCalledTimes(1)
    const [frames, opts] = animate.mock.calls[0]
    expect(frames).toEqual([{ opacity: 0.6 }, { opacity: 1 }])
    expect(opts.duration).toBeLessThanOrEqual(200)
    fireEvent.keyDown(window, { key: "g" })
    path = "/app/later"
    view.rerender(<PageTransition><p>later</p></PageTransition>)
    expect(animate).toHaveBeenCalledTimes(1)
  })
})
