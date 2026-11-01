import { describe, expect, it } from "vitest"
import { cardSize } from "./cards"
import { freeCardSpot, nearestFreeSpot, scrollToCentre, viewBox } from "./placement"
import { viewCentre } from "./viewport"

describe("where a card laid from a list goes (miro-13 2)", () => {
  const TASK = cardSize("task")
  const rect = (x: number, y: number, width = 180, height = width) => ({ x, y, width, height })

  it("finds the free spot nearest a point that a room holds whole: down a column first, then beside, never out of the room", () => {
    const room = { x: 0, y: 0, width: 1000, height: 800 }
    const at = rect(410, 310)
    expect(nearestFreeSpot(at, [], room)).toEqual({ x: 410, y: 310 })
    // Taken: a box and a gap below; then, at the same distance, beside before above.
    expect(nearestFreeSpot(at, [at], room)).toEqual({ x: 410, y: 514 })
    expect(nearestFreeSpot(at, [at, rect(410, 514)], room)).toEqual({ x: 614, y: 310 })
    // Below would leave the room: beside, inside it.
    expect(nearestFreeSpot(at, [at], { ...room, height: 600 })).toEqual({ x: 614, y: 310 })
    // Nothing in the room free.
    expect(nearestFreeSpot(at, [room], room)).toBeNull()
  })

  it("a card goes where it is asked when nothing is there, and below what is there when something is, never on it", () => {
    const wide = { x: -5000, y: -5000, width: 10000, height: 10000 }
    expect(freeCardSpot({ x: 500, y: 400 }, "task", [], wide)).toEqual({ x: 500, y: 400, shown: true })
    // Something far away leaves the spot free.
    expect(freeCardSpot({ x: 500, y: 400 }, "task", [rect(2000, 2000, 200)], wide)).toEqual({ x: 500, y: 400, shown: true })
    // A shape under the spot: the card goes below, past it.
    const under = rect(400, 300, 200)
    const spot = freeCardSpot({ x: 500, y: 400 }, "task", [under], wide)
    expect(spot.x).toBe(500)
    expect(spot.y - TASK.height / 2).toBeGreaterThanOrEqual(under.y + under.height)
    // A run: the next card past the one just laid.
    const first = { x: 500 - TASK.width / 2, y: 400 - TASK.height / 2, width: TASK.width, height: TASK.height }
    expect(freeCardSpot({ x: 500, y: 400 }, "task", [first], wide)).toEqual({ x: 500, y: 400 + TASK.height + 24, shown: true })
  })

  it("a card goes where the view shows it whole, never under the board's own bars, and says when nothing in view is free", () => {
    const view = { x: 0, y: 0, width: 1000, height: 800 }
    const first = { x: 500 - TASK.width / 2, y: 400 - TASK.height / 2, width: TASK.width, height: TASK.height }
    // A bar floats where the next card down would go: it goes above the one just laid instead.
    const bar = { x: 300, y: 600, width: 400, height: 60 }
    expect(freeCardSpot({ x: 500, y: 400 }, "task", [first, bar], view)).toEqual({ x: 500, y: 400 - TASK.height - 24, shown: true })
    // Nothing in view free: the next free spot down, past the view, for the board to bring into view.
    const spot = freeCardSpot({ x: 500, y: 400 }, "task", [view], view)
    expect(spot.shown).toBe(false)
    expect(spot.x).toBe(500)
    expect(spot.y - TASK.height / 2).toBeGreaterThanOrEqual(view.y + view.height)
  })

  it("says what of the scene a view shows, and the scroll that brings a point to its middle", () => {
    const v = { scrollX: -100, scrollY: 50, zoom: 2, width: 800, height: 600 }
    expect(viewBox(v)).toEqual({ x: 100, y: -50, width: 400, height: 300 })
    const p = { x: 420, y: -7 }
    expect(viewCentre({ ...v, ...scrollToCentre(v, p) })).toEqual(p)
  })
})
