import { describe, expect, it } from "vitest"
import { centreOn, pointerOf } from "./hereNow"

// "Here now" on a board (miro-04 4): where to look to see someone. Who is here is the doc's grouping (presence/people.test).

const tab = (id: string | null, name: string, pointer?: { x: number; y: number }) => ({ user: id ? { id, name } : null, ...(pointer ? { pointer } : {}) })

describe("here now on a board", () => {
  it("reads where a tab points, or nothing when it hasn't pointed", () => {
    const states = new Map<number, unknown>([[1, tab("sam", "Sam", { x: 40, y: -20 })], [2, tab("ann", "Ann")]])
    expect(pointerOf(states, 1)).toEqual({ x: 40, y: -20 })
    expect(pointerOf(states, 2)).toBeNull()
    expect(pointerOf(states, 9)).toBeNull()
  })

  it("scrolls a point to the middle of the canvas at the zoom it's at", () => {
    // At zoom 2 an 800 by 600 canvas shows 400 by 300 of the board: the point lands at (x + scrollX) * 2 = 400.
    const s = centreOn({ width: 800, height: 600, zoom: 2 }, { x: 1000, y: 50 })
    expect(s).toEqual({ scrollX: -800, scrollY: 100 })
    expect((1000 + s.scrollX) * 2).toBe(400)
    expect((50 + s.scrollY) * 2).toBe(300)
  })
})
