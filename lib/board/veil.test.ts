import { describe, expect, it } from "vitest"
import { veilBox, veilHoles } from "./veil"

// The veil over a board (the tag filter's, Find's): the holes it leaves for the elements it keeps.

const el = (o: Partial<{ type: string; x: number; y: number; width: number; height: number; angle: number; points: number[][] }> = {}) => ({
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  ...o,
})

describe("a board's veil", () => {
  it("gives the veil a hole for each kept element, its own shape, in canvas pixels, a little past its edges", () => {
    const view = { scrollX: 10, scrollY: 20, zoom: 2, width: 800, height: 600 }
    // The note at scene (0, 0), 100 square: on the canvas (0+10)*2 = 20 to (100+10)*2 = 220 across, 40 to 240 down,
    // and 6px past each edge, whatever the zoom.
    expect(veilHoles(view, [el()])).toEqual(["M14 34L226 34L226 246L14 246Z"])
    expect(veilHoles(view, [])).toEqual([])
  })

  it("turns a hole as its element is turned, about the element's middle", () => {
    const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 400, height: 400 }
    // A quarter turn of a 100 by 50 note at (100, 100): its middle stays at (150, 125), and it stands 50 wide, 100 tall.
    const [hole] = veilHoles(view, [el({ x: 100, y: 100, width: 100, height: 50, angle: Math.PI / 2 })], 0)
    expect(hole).toBe("M175 75L175 175L125 175L125 75Z")
  })

  it("takes a line's or an arrow's box from its points, which run from its x and y either way", () => {
    expect(veilBox(el({ type: "line", x: 10, y: 10, width: 40, height: 30, points: [[0, 0], [-40, 30]] }))).toEqual({ x: -30, y: 10, width: 40, height: 30 })
    const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 400, height: 400 }
    // An arrow from (100, 100) up and right to (300, 50): its hole is that box, not one hung from its first point.
    expect(veilHoles(view, [el({ type: "arrow", x: 100, y: 100, width: 200, height: 50, points: [[0, 0], [200, -50]] })], 0)).toEqual(["M100 50L300 50L300 100L100 100Z"])
  })

  it("runs a hole up over what an element shows above its box, the same on the page whatever the zoom", () => {
    const view = { scrollX: 0, scrollY: 0, zoom: 2, width: 800, height: 600 }
    // A frame's name 24 px above it: at 2x that is 12 of the board's units, so the hole's top is 24 px above the frame's.
    const nameRoom = (e: { type: string }) => (e.type === "frame" ? 24 : 0)
    expect(veilHoles(view, [el({ type: "frame" })], 0, nameRoom)).toEqual(["M0 -24L200 -24L200 200L0 200Z"])
    expect(veilHoles(view, [el()], 0, nameRoom)).toEqual(["M0 0L200 0L200 200L0 200Z"])
  })
})
