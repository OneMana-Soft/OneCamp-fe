import { describe, expect, it } from "vitest"
import { fromMap, mapFrame, shownBox, toMap } from "./boardMap"
import { drawnBox } from "./scene"

// A small map of the board (miro-04 3): what's drawn, what's shown, and the map's frame for both.

describe("the board's map", () => {
  it("boxes everything drawn, a line's own points included, and nothing for an empty board", () => {
    const els = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 300, y: 200, width: 40, height: 40 },
      // An arrow drawn up and to the left from where it starts.
      { x: 50, y: 400, width: 120, height: 500, points: [[0, 0], [-120, -500]] as [number, number][] },
      { x: 9000, y: 9000, width: 10, height: 10, isDeleted: true },
    ]
    expect(drawnBox(els)).toEqual({ x: -70, y: -100, width: 410, height: 500 })
    expect(drawnBox([])).toBeNull()
  })

  it("reads the part a screen shows from its scroll and zoom", () => {
    expect(shownBox({ scrollX: -200, scrollY: 100, zoom: 2, width: 800, height: 600 })).toEqual({ x: 200, y: -100, width: 400, height: 300 })
  })

  it("fits the drawing and the part shown, both whole, in the middle of the map, and maps points both ways", () => {
    const drawn = { x: 0, y: 0, width: 1000, height: 400 }
    const shown = { x: 900, y: 300, width: 400, height: 300 }
    // Together 0..1300 across and 0..600 down; the map is 216 by 144 with 8 all round: 200/1300 is the smaller scale.
    const f = mapFrame(drawn, shown, 216, 144, 8)
    expect(f.scale).toBeCloseTo(200 / 1300, 6)
    const a = toMap(f, 0, 0)
    const b = toMap(f, 1300, 600)
    expect(a.x).toBeCloseTo(8, 6)
    expect(b.x).toBeCloseTo(208, 6)
    // Centred down the map.
    expect((a.y + b.y) / 2).toBeCloseTo(72, 6)
    const back = fromMap(f, b.x, b.y)
    expect(back.x).toBeCloseTo(1300, 6)
    expect(back.y).toBeCloseTo(600, 6)
  })

  it("shows the part shown alone on an empty board", () => {
    const f = mapFrame(null, { x: -50, y: -50, width: 100, height: 100 }, 216, 144, 8)
    expect(toMap(f, 0, 0)).toEqual({ x: 108, y: 72 })
  })
})
