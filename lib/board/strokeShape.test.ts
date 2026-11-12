import { describe, expect, it } from "vitest"
import { HOLD_MS, heldStill, recognizeStroke, shapeSkeleton, type Pt, type Sample } from "./strokeShape"

/** A hand's stroke through corners: a point every few px, each off its line by a wobble that is the same every run. */
function drawn(corners: Pt[], { step = 6, wobble = 3 } = {}): Pt[] {
  const out: Pt[] = []
  let n = 0
  for (let i = 1; i < corners.length; i++) {
    const [a, b] = [corners[i - 1], corners[i]]
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let s = 0; s < steps; s++, n++) {
      out.push({ x: a.x + ((b.x - a.x) * s) / steps + Math.sin(n * 0.35) * wobble, y: a.y + ((b.y - a.y) * s) / steps + Math.cos(n * 0.45) * wobble })
    }
  }
  return [...out, corners[corners.length - 1]]
}
/** A hand's round stroke: `turns` times round, a little out of true. */
const round = (cx: number, cy: number, rx: number, ry: number, turns = 1.02): Pt[] =>
  Array.from({ length: Math.round(64 * turns) }, (_, i) => {
    const a = (i / (Math.round(64 * turns) - 1)) * turns * 2 * Math.PI
    const off = 1 + Math.sin(i * 0.4) * 0.03
    return { x: cx + Math.cos(a) * rx * off, y: cy + Math.sin(a) * ry * off }
  })
const p = (x: number, y: number): Pt => ({ x, y })
const near = (a: Pt, b: Pt, by = 8) => Math.hypot(a.x - b.x, a.y - b.y) <= by

describe("the shape a held stroke looks like", () => {
  it("a wobbly square is a rectangle on the stroke's own box", () => {
    const shape = recognizeStroke(drawn([p(100, 100), p(220, 104), p(216, 222), p(98, 218), p(103, 106)]))
    expect(shape?.kind).toBe("rectangle")
    if (shape?.kind !== "rectangle") return
    expect(near(p(shape.x, shape.y), p(98, 100))).toBe(true)
    expect(Math.abs(shape.width - 122)).toBeLessThan(8)
    expect(Math.abs(shape.height - 122)).toBeLessThan(8)
  })

  it("a circle and a wide oval are ellipses", () => {
    expect(recognizeStroke(round(200, 200, 60, 60))).toMatchObject({ kind: "ellipse" })
    const oval = recognizeStroke(round(300, 200, 110, 40))
    expect(oval?.kind).toBe("ellipse")
    if (oval?.kind === "ellipse") expect(oval.width).toBeGreaterThan(2 * oval.height)
  })

  it("a closed triangle is a triangle through its three corners", () => {
    const corners = [p(160, 80), p(240, 220), p(80, 215)]
    const shape = recognizeStroke(drawn([...corners, p(158, 84)]))
    expect(shape?.kind).toBe("triangle")
    if (shape?.kind !== "triangle") return
    for (const c of corners) expect(shape.points.some((q) => near(q, c))).toBe(true)
  })

  it("a square stood on its corner is a diamond", () => {
    expect(recognizeStroke(drawn([p(200, 100), p(300, 180), p(200, 260), p(100, 180), p(198, 103)]))).toMatchObject({ kind: "diamond" })
  })

  it("an open straight stroke is a line between its ends, level when it nearly is", () => {
    const slanted = recognizeStroke(drawn([p(100, 100), p(300, 180)]))
    expect(slanted?.kind).toBe("line")
    if (slanted?.kind === "line") expect(near(slanted.to, p(300, 180), 1)).toBe(true)
    const level = recognizeStroke(drawn([p(100, 200), p(320, 206)]))
    expect(level).toMatchObject({ kind: "line", to: { x: 320 } })
    if (level?.kind === "line") expect(level.to.y).toBe(level.from.y)
  })

  it("a straight stroke with a head drawn back from its tip is an arrow to the tip", () => {
    const shape = recognizeStroke(drawn([p(100, 300), p(300, 300), p(270, 280), p(300, 300), p(270, 320)]))
    expect(shape?.kind).toBe("arrow")
    if (shape?.kind !== "arrow") return
    expect(near(shape.from, p(100, 300))).toBe(true)
    expect(near(shape.to, p(300, 300), 12)).toBe(true)
  })

  it("a scribble, a corner, a stroke twice round and a tick stay ink", () => {
    expect(recognizeStroke(drawn([p(100, 100), p(220, 110), p(105, 125), p(225, 140), p(100, 155), p(220, 170)]))).toBeNull()
    expect(recognizeStroke(drawn([p(100, 100), p(100, 200), p(200, 200)]))).toBeNull()
    expect(recognizeStroke(round(200, 200, 60, 60, 2.02))).toBeNull()
    expect(recognizeStroke(drawn([p(10, 10), p(20, 18)]))).toBeNull()
    expect(recognizeStroke([])).toBeNull()
  })

  // CR-254 S5, S7, S8 (review-254/miro10/probe): the branches the cases above leave unpinned, on straight, even paths.
  it("a closed five-pointed star stays ink: its points stray too far from any shape's outline", () => {
    const star = Array.from({ length: 11 }, (_, i) => {
      const [r, a] = [i % 2 ? 40 : 100, (Math.PI * i) / 5 - Math.PI / 2]
      return p(200 + r * Math.cos(a), 200 + r * Math.sin(a))
    })
    expect(recognizeStroke(drawn(star, { step: 4, wobble: 0 }))).toBeNull()
  })

  it("a nearly upright line is drawn upright", () => {
    expect(recognizeStroke(drawn([p(50, 0), p(54, 120)], { step: 4, wobble: 0 }))).toEqual({ kind: "line", from: p(50, 0), to: p(50, 120) })
  })

  it("a hairpin, out and most of the way back, stays ink: its head is too long for an arrow's", () => {
    expect(recognizeStroke(drawn([p(0, 0), p(100, 0), p(40, 10)], { step: 4, wobble: 0 }))).toBeNull()
  })
})

describe("a stroke held still", () => {
  // Ten moves 10 px apart, a frame each: the pen comes to rest at t = 160.
  const stroke: Sample[] = Array.from({ length: 11 }, (_, i) => ({ t: i * 16, x: 100 + i * 10, y: 100 }))
  const rest = stroke[stroke.length - 1].t

  it("is one whose pen rests for the hold before it lifts", () => {
    expect(heldStill(stroke, rest + HOLD_MS)).toBe(true)
    expect(heldStill(stroke, rest + HOLD_MS + 400)).toBe(true)
  })

  it("is not a quick stroke, lifted as it moves or a moment after", () => {
    expect(heldStill(stroke, 176)).toBe(false)
    expect(heldStill(stroke, rest + HOLD_MS - 1)).toBe(false)
    expect(heldStill([], 1000)).toBe(false)
  })

  it("lets the resting pen tremble, and starts again when it moves on", () => {
    const trembling = [...stroke, { t: 300, x: 202, y: 101 }, { t: 500, x: 199, y: 98 }]
    expect(heldStill(trembling, rest + HOLD_MS)).toBe(true)
    const movedOn = [...stroke, { t: 600, x: 240, y: 100 }]
    expect(heldStill(movedOn, 700)).toBe(false)
  })
})

describe("the shape's skeleton", () => {
  const ink = { strokeColor: "#1e1e1e", strokeWidth: 2, opacity: 100, roughness: 0, round: true }
  it("is a rectangle in the stroke's ink and the board's style", () => {
    expect(shapeSkeleton({ kind: "rectangle", x: 10, y: 20, width: 120, height: 80 }, ink)).toMatchObject({
      type: "rectangle", x: 10, y: 20, width: 120, height: 80, strokeColor: "#1e1e1e", strokeWidth: 2, roughness: 0, roundness: { type: 3 }, backgroundColor: "transparent",
    })
    expect(shapeSkeleton({ kind: "ellipse", x: 0, y: 0, width: 50, height: 50 }, { ...ink, roughness: 1 })).toMatchObject({ type: "ellipse", roughness: 1, roundness: null })
  })
  it("is a closed line for a triangle, and a two-point line or arrow", () => {
    expect(shapeSkeleton({ kind: "triangle", points: [p(10, 10), p(60, 10), p(10, 70)] }, ink)).toMatchObject({ type: "line", x: 10, y: 10, points: [[0, 0], [50, 0], [0, 60], [0, 0]], roundness: null })
    expect(shapeSkeleton({ kind: "arrow", from: p(5, 5), to: p(105, 5) }, ink)).toMatchObject({ type: "arrow", x: 5, y: 5, points: [[0, 0], [100, 0]], endArrowhead: "arrow" })
    expect(shapeSkeleton({ kind: "line", from: p(5, 5), to: p(5, 95) }, ink)).not.toHaveProperty("endArrowhead")
  })
})
