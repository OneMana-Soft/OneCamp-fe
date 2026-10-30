import { describe, expect, it } from "vitest"
import { countedPoints, pointsLabel, pointsText } from "@/lib/work/points"

// linear-05: points named as the project's scale names them, and counted as it counts them.
describe("points on a scale", () => {
  const shirt = { sizes: [1, 2, 3, 5, 8], labels: ["XS", "S", "M", "L", "XL"] }

  it("names a size as the scale does, and points off the scale by their number", () => {
    expect(pointsLabel(shirt, 3)).toBe("M")
    expect(pointsLabel(shirt, 13)).toBe("13")
    expect(pointsLabel({ sizes: [0, 1, 2], labels: ["0", "1", "2"] }, 0)).toBe("0")
  })

  it("says points in words, to a tenth", () => {
    expect(pointsText(1)).toBe("1 point")
    expect(pointsText(13)).toBe("13 points")
    expect(pointsText(2.46)).toBe("2.5 points")
    expect(pointsText(0)).toBe("0 points")
  })

  it("counts a task with none as one, or nothing, as the scale says", () => {
    expect(countedPoints({ count_unestimated: true }, undefined)).toBe(1)
    expect(countedPoints({ count_unestimated: false }, undefined)).toBe(0)
    expect(countedPoints({ count_unestimated: true }, 0)).toBe(0)
    expect(countedPoints({ count_unestimated: false }, 5)).toBe(5)
  })
})
