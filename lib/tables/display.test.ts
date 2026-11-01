import { describe, expect, it } from "vitest"
import { DEFAULT_DISPLAY, MAX_FROZEN, frozenCount, frozenLefts, frozenMarks, readDisplay } from "@/lib/tables/display"

// Freezing up to three columns (G2b; airtable-04, gsheets-grid-01): how many
// leading columns stay put sideways, as a reader's browser or a saved view
// keeps it, and the marks and offsets table.css reads.
describe("frozen columns", () => {
  it("are one by default, and up to three as kept; anything else reads as one", () => {
    expect(DEFAULT_DISPLAY.frozen).toBe(1)
    expect(MAX_FROZEN).toBe(3)
    expect(readDisplay({}).frozen).toBe(1)
    expect(readDisplay({ frozen: 2 }).frozen).toBe(2)
    expect(readDisplay({ frozen: 3 }).frozen).toBe(3)
    for (const bad of [0, 4, 2.5, -1, "2", null, Number.NaN]) expect(readDisplay({ frozen: bad }).frozen).toBe(1)
  })

  it("count no more than the columns there are, and a phone keeps one", () => {
    expect(frozenCount(3, 5, false)).toBe(3)
    expect(frozenCount(3, 2, false)).toBe(2)
    expect(frozenCount(2, 5, true)).toBe(1)
    expect(frozenCount(1, 0, false)).toBe(0)
    expect(frozenCount(9, 9, false)).toBe(MAX_FROZEN)
  })

  it("mark each frozen column's place, the last one's edge and the sticky lead; none past them", () => {
    expect(frozenMarks(0, 1)).toEqual({ "data-frozen": 0, "data-frozen-edge": "", "data-sticky-lead": "" })
    expect(frozenMarks(0, 3)).toEqual({ "data-frozen": 0, "data-sticky-lead": "" })
    expect(frozenMarks(1, 3)).toEqual({ "data-frozen": 1, "data-sticky-lead": "" })
    expect(frozenMarks(2, 3)).toEqual({ "data-frozen": 2, "data-frozen-edge": "", "data-sticky-lead": "" })
    expect(frozenMarks(3, 3)).toEqual({})
    expect(frozenMarks(1, 1)).toEqual({})
  })

  it("stick each column after the first past the widths before it", () => {
    expect(frozenLefts([232, 160, 120], 1)).toEqual({})
    expect(frozenLefts([232, 160, 120], 2)).toEqual({ "--frozen-1": "232px" })
    expect(frozenLefts([232, 160, 120], 3)).toEqual({ "--frozen-1": "232px", "--frozen-2": "392px" })
  })
})
