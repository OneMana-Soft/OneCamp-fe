import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { ShapesPreview } from "./shapesPreview"
import type { PreviewShapes } from "@/lib/board/previewShapes"

// A board drawn small fills its box's tighter side, whatever the box: in the
// picker's whole pane a retro read as a few specks in the middle, because the
// drawing kept a tile's shape (DESIGN-BUILD-7, 23 Oct).

afterEach(cleanup)

/** Three columns of notes, three times as wide as it is high: a retro. */
const retro: PreviewShapes = {
  notes: [0, 400, 800].map((x) => ({ x, y: 0, w: 400, h: 400, colour: "green" as const })),
  frames: [],
  boxes: [],
  lines: [],
  labels: [],
  width: 1200,
  height: 400,
}

describe("a board drawn small", () => {
  it("takes the drawing's own shape, padded, so the svg meets any box with it", () => {
    const { container } = render(<ShapesPreview shapes={retro} id="retro" height={340} pad={10} />)
    const box = container.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number)
    expect(box).toEqual([0, 0, 200, Math.round((400 * 180) / 1200 + 20)])
    const notes = Array.from(container.querySelectorAll("g > rect:nth-child(2)"))
    expect(Number(notes[0].getAttribute("x"))).toBe(10)
    const last = notes[notes.length - 1]
    expect(Number(last.getAttribute("x")) + Number(last.getAttribute("width"))).toBeCloseTo(190)
  })
})
