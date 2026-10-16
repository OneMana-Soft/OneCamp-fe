import { describe, expect, it, vi } from "vitest"
import { PRESS_LIFT, holdLifted, pressBecomes } from "./pressLift"

const at = { x: 100, y: 100 }

describe("when a press becomes a drag", () => {
  it("lifts a mouse after 5 px of travel, and not before", () => {
    const press = { ...at, touch: false, held: false }
    expect(pressBecomes(press, 103, 103)).toBe("press")
    expect(pressBecomes(press, 104, 103)).toBe("drag")
    // A mouse held still stays a press, however long: it never scrolls.
    expect(pressBecomes({ ...press, held: true }, 100, 100)).toBe("press")
  })

  it("lifts a finger once held, and reads one that strays past 8 px before then as a scroll", () => {
    const press = { ...at, touch: true, held: false }
    expect(pressBecomes(press, 106, 105)).toBe("press")
    expect(pressBecomes(press, 100, 109)).toBe("scroll")
    expect(pressBecomes({ ...press, held: true }, 100, 100)).toBe("drag")
    expect(pressBecomes({ ...press, held: true }, 100, 160)).toBe("drag")
  })

  it("holds the spec's numbers", () => {
    expect(PRESS_LIFT).toEqual({ travel: 5, hold: 250, slop: 8 })
  })
})

describe("a lifted drag's hold on the pointer", () => {
  it("keeps the page from scrolling under a finger and from opening a context menu, until it lets go", () => {
    const menu = vi.fn()
    document.addEventListener("contextmenu", menu)
    try {
      const letGo = holdLifted()
      const move = new Event("touchmove", { bubbles: true, cancelable: true })
      document.body.dispatchEvent(move)
      expect(move.defaultPrevented).toBe(true)
      const held = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
      document.body.dispatchEvent(held)
      expect(held.defaultPrevented).toBe(true)
      expect(menu).not.toHaveBeenCalled()
      letGo()
      const later = new Event("touchmove", { bubbles: true, cancelable: true })
      document.body.dispatchEvent(later)
      expect(later.defaultPrevented).toBe(false)
      document.body.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }))
      expect(menu).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener("contextmenu", menu)
    }
  })
})
