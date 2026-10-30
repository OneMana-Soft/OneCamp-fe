import { describe, expect, it } from "vitest"
import { itemsThatFit, textWidth } from "./rowFit"

// A row that knows what fits before it draws: a note's tag chips show the
// ones that fit whole and count the rest.

const count = () => 30

describe("how many of a row's items fit whole", () => {
  it("takes them all when they fit, with no count", () => {
    expect(itemsThatFit([50, 40, 60], 158, count, 4)).toBe(3)
  })

  it("keeps room for the count of those left out", () => {
    // 50 + 4 + 40 = 94 fits, but with the count of the third (4 + 30) it's 128 > 120: one, then "+2".
    expect(itemsThatFit([50, 40, 60], 120, count, 4)).toBe(1)
    expect(itemsThatFit([50, 40, 60], 128, count, 4)).toBe(2)
  })

  it("never takes more than the most it may show, counting the rest", () => {
    expect(itemsThatFit([10, 10, 10, 10, 10], 1000, count, 4, 3)).toBe(3)
  })

  it("fits none when the first is too wide for the row (the caller shows it cut short)", () => {
    expect(itemsThatFit([400, 20], 100, count, 4)).toBe(0)
    expect(itemsThatFit([400], 100, count, 4)).toBe(0)
  })

  it("shows nothing for an empty row", () => {
    expect(itemsThatFit([], 100, count, 4)).toBe(0)
  })

  it("asks the count's width for the number actually left out", () => {
    const asked: number[] = []
    itemsThatFit([50, 50, 50, 50], 120, (left) => (asked.push(left), 30), 4)
    expect(asked).toEqual([3, 2])
  })
})

describe("a text's width in its font", () => {
  it("grows with the words and the size, and is the same each time it's asked", () => {
    const short = textWidth("ux", "510 12px Inter, sans-serif")
    const long = textWidth("Supplier contract renewal", "510 12px Inter, sans-serif")
    expect(short).toBeGreaterThan(0)
    expect(long).toBeGreaterThan(short * 5)
    expect(textWidth("ux", "510 24px Inter, sans-serif")).toBeCloseTo(short * 2, 5)
    expect(textWidth("ux", "510 12px Inter, sans-serif")).toBe(short)
  })
})
