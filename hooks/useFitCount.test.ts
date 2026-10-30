import { describe, expect, it } from "vitest"
import { fitCount } from "./useFitCount"

// A line of chips shows the ones that fit whole, then "+N" (a table's files
// cell): never a chip cut by the line's edge.
describe("how many items fit whole on a line", () => {
  it("are all of them when they fit, with no room kept for +N", () => {
    expect(fitCount([60, 60, 60], 188, { gap: 4, more: 32 })).toBe(3)
  })

  it("leave room for +N after the ones that fit", () => {
    // 60 + 4 + 60 = 124, and +N after it needs 4 + 32 more: 160.
    expect(fitCount([60, 60, 60], 170, { gap: 4, more: 32 })).toBe(2)
    expect(fitCount([60, 60, 60], 150, { gap: 4, more: 32 })).toBe(1)
  })

  it("show the first even when it alone is wider than the line", () => {
    expect(fitCount([400, 60], 250, { gap: 4, more: 32 })).toBe(1)
    expect(fitCount([], 250)).toBe(0)
  })
})
