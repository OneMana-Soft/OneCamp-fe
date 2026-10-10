import { describe, expect, it } from "vitest"
import { formatCardValue } from "./DataTableBoard"

describe("a board card's values", () => {
  it("read as the grid's do", () => {
    expect(formatCardValue("2026-10-07", "date")).toMatch(/^7 Oct( 2026)?$/)
    expect(formatCardValue(1580, "number")).toBe((1580).toLocaleString(undefined, { maximumFractionDigits: 6 }))
    expect(formatCardValue(["a", "b"], "multi_select")).toBe("a, b")
  })
})
