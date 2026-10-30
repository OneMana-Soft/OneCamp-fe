import { describe, expect, it } from "vitest"
import { aimAt, dropMarks, ghostAt, ghostWords, stopsFor, swapWith, type Spot } from "./SplitArrange"

// Split view's arrange layer (release-1010/design/split/ANALYSIS.md §5): where
// a held view lands, where the arrow keys stop, and the marks a drop draws.
const spot = (key: string, left: number, width = 400): Spot => ({ key, rect: { left, right: left + width, width, top: 8, height: 884 } })
// The page and two docs side by side, with 8px seams between.
const row = [spot("main", 248), spot("doc:a", 656), spot("doc:b", 1064)]

describe("where a held view lands", () => {
  it("goes before or after a view over its outer quarters and swaps over its middle half", () => {
    expect(aimAt(270, row, "doc:b")).toEqual({ key: "main", zone: "before" })
    expect(aimAt(448, row, "doc:b")).toEqual({ key: "main", zone: "swap" })
    expect(aimAt(640, row, "doc:b")).toEqual({ key: "main", zone: "after" })
  })

  it("never aims where nothing would change: over itself, or just beside where it is", () => {
    expect(aimAt(1200, row, "doc:b")).toBeNull()
    expect(aimAt(1040, row, "doc:b")).toBeNull()
  })

  it("walks the keys through every place that changes something, left to right", () => {
    expect(stopsFor(row, "doc:b").map((s) => s.aim)).toEqual([
      { key: "main", zone: "before" },
      { key: "main", zone: "swap" },
      { key: "doc:a", zone: "before" },
      { key: "doc:a", zone: "swap" },
    ])
  })
})

describe("the marks a drop between views draws (design verdict, 20 Oct)", () => {
  it("centres the line in the gap, and drafts the incoming column on the line's side, never past half the target", () => {
    // Before the row's first view: in the gutter, the slot over the page's left half.
    expect(dropMarks({ key: "main", zone: "before" }, row, "doc:b")).toEqual({ x: 244, top: 8, height: 884, slotLeft: 248, slotWidth: 200 })
    // Between the page and doc:a: the seam's middle, the slot over the page's right half.
    expect(dropMarks({ key: "main", zone: "after" }, row, "doc:b")).toEqual({ x: 652, top: 8, height: 884, slotLeft: 448, slotWidth: 200 })
  })

  it("takes a narrower held view's own width, and draws no line for a swap (it tints the whole target)", () => {
    expect(dropMarks({ key: "main", zone: "before" }, [spot("main", 248, 500), spot("doc:b", 756, 160)], "doc:b")?.slotWidth).toBe(160)
    expect(dropMarks({ key: "main", zone: "swap" }, row, "doc:b")).toBeNull()
  })
})

// Design r5 (21 Oct): the ghost carries the action, so no chip of its own can
// sit under it, and it never runs off the window's edge.
describe("the ghost", () => {
  it("says the held view's name, or over a swap the swap, cut at a word to what it holds", () => {
    expect(ghostWords("Pricing notes", null)).toBe("Pricing notes")
    expect(swapWith("Q4 launch plan")).toBe("Swap with Q4 launch plan")
    expect(ghostWords("Pricing notes", "Q4 launch plan")).toBe("Swap with Q4 launch plan")
    const long = ghostWords("Pricing notes", "Quarterly planning for the platform team")
    expect(long).toBe("Swap with Quarterly planning…")
    expect(long.length).toBeLessThanOrEqual(30)
  })

  it("sits below and right of the pointer, and stays 8px inside the window", () => {
    const view = { width: 1440, height: 900 }
    const size = { width: 200, height: 40 }
    expect(ghostAt({ x: 600, y: 30 }, size, view)).toEqual({ x: 614, y: 40 })
    // Carried by the rightmost view's bar, it ran off the window's edge.
    expect(ghostAt({ x: 1300, y: 30 }, size, view)).toEqual({ x: 1232, y: 40 })
    expect(ghostAt({ x: 600, y: 890 }, size, view)).toEqual({ x: 614, y: 852 })
    expect(ghostAt({ x: -40, y: -40 }, size, view)).toEqual({ x: 8, y: 8 })
  })
})
