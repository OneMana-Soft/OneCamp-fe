import { describe, expect, it } from "vitest"
import { listKey, rangeOf, stepAcross, stepIn } from "./listKeys"

const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

describe("list keys", () => {
  it("move, open, select and edit", () => {
    expect(listKey(k("j"))).toEqual({ type: "move", by: 1, extend: false })
    expect(listKey(k("ArrowUp"))).toEqual({ type: "move", by: -1, extend: false })
    expect(listKey(k("J", { shiftKey: true }))).toEqual({ type: "move", by: 1, extend: true })
    expect(listKey(k("ArrowDown", { shiftKey: true }))).toEqual({ type: "move", by: 1, extend: true })
    expect(listKey(k("Enter"))).toEqual({ type: "open" })
    expect(listKey(k("x"))).toEqual({ type: "toggle" })
    expect(listKey(k("s"))).toEqual({ type: "edit", field: "status" })
    expect(listKey(k("l"))).toEqual({ type: "edit", field: "tags" })
    expect(listKey(k("ArrowRight"))).toEqual({ type: "column", by: 1 })
  })
  it("leave modified keys to others", () => {
    expect(listKey(k("k", { ctrlKey: true }))).toBeNull()
    expect(listKey(k("k", { metaKey: true }))).toBeNull()
    expect(listKey(k("s", { altKey: true }))).toBeNull()
    expect(listKey(k("Enter", { shiftKey: true }))).toBeNull()
    expect(listKey(k("q"))).toBeNull()
  })
})

describe("moving", () => {
  const order = ["a", "b", "c"]
  it("steps within the list and starts at an end", () => {
    expect(stepIn(order, null, 1)).toBe("a")
    expect(stepIn(order, null, -1)).toBe("c")
    expect(stepIn(order, "a", 1)).toBe("b")
    expect(stepIn(order, "c", 1)).toBe("c")
    expect(stepIn(order, "a", -1)).toBe("a")
    // A highlighted task that left the list (filtered out after a change).
    expect(stepIn(order, "gone", 1)).toBe("a")
    expect(stepIn([], null, 1)).toBeNull()
  })
  it("selects a run either way", () => {
    expect(rangeOf(["a", "b", "c", "d"], "b", "d")).toEqual(["b", "c", "d"])
    expect(rangeOf(["a", "b", "c", "d"], "c", "a")).toEqual(["a", "b", "c"])
    expect(rangeOf(["a", "b"], "gone", "b")).toEqual(["b"])
  })
  it("crosses a board's columns at the same height, past empty ones", () => {
    const cols = [["a1", "a2", "a3"], [], ["c1"], ["d1", "d2", "d3", "d4"]]
    expect(stepAcross(cols, "a3", 1)).toBe("c1")
    expect(stepAcross(cols, "c1", 1)).toBe("d1")
    expect(stepAcross(cols, "d3", -1)).toBe("c1")
    expect(stepAcross(cols, "a2", -1)).toBe("a2")
    expect(stepAcross(cols, null, 1)).toBe("a1")
  })
})
