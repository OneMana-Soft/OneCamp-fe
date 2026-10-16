import { describe, expect, it } from "vitest"
import { formatCardValue } from "./DataTableBoard"

describe("a board card's values", () => {
  it("read as the grid's do", () => {
    expect(formatCardValue("2026-10-07", "date")).toMatch(/^7 Oct( 2026)?$/)
    expect(formatCardValue(1580, "number")).toBe((1580).toLocaleString(undefined, { maximumFractionDigits: 6 }))
    expect(formatCardValue(["a", "b"], "multi_select")).toBe("a, b")
  })
})

// TAB-BUG-5: a linked item the reader can't open reads as one phrase, never by its id.
describe("a board card's links", () => {
  it("names what the reader may open and counts the rest", () => {
    expect(formatCardValue([{ id: "d1", type: "doc", label: "Plan" }, { id: "x1", type: "doc", hidden: true }, { id: "x2", type: "doc", hidden: true }], "relation")).toBe("Plan, 2 things you can't open")
    expect(formatCardValue([{ id: "x1", type: "doc", hidden: true }], "relation")).toBe("Something you can't open")
  })
})
