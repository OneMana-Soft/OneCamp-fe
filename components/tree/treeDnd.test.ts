import { describe, expect, it } from "vitest"
import { canDrop, dropMove, dropZone, keyMove, moveWithin, type TreeSpot } from "@/components/tree/treeDnd"

const spot = (id: string, siblings: string[], extra: Partial<TreeSpot> = {}): TreeSpot => ({
  id,
  parent: null,
  siblings,
  open: false,
  canNest: true,
  ancestors: [],
  ...extra,
})

describe("dropZone", () => {
  it("drops beside a row at its edges and into it in the middle", () => {
    expect(dropZone(100, 32, 102, true)).toBe("before")
    expect(dropZone(100, 32, 116, true)).toBe("inside")
    expect(dropZone(100, 32, 130, true)).toBe("after")
  })
  it("splits a row that can't take children in two", () => {
    expect(dropZone(100, 32, 110, false)).toBe("before")
    expect(dropZone(100, 32, 120, false)).toBe("after")
  })
})

describe("dropMove", () => {
  const ids = ["a", "b", "c"]
  it("puts a row after another, first, or inside", () => {
    expect(dropMove(spot("a", ids), spot("c", ids), "after")).toEqual({ id: "a", to: null, after: "c" })
    expect(dropMove(spot("c", ids), spot("a", ids), "before")).toEqual({ id: "c", to: null, after: null, place: "first" })
    expect(dropMove(spot("c", ids), spot("b", ids), "before")).toEqual({ id: "c", to: null, after: "a" })
    expect(dropMove(spot("a", ids), spot("c", ids), "inside")).toEqual({ id: "a", to: "c", after: null, place: "last" })
  })
  it("puts a row first under an open row when dropped just below it", () => {
    expect(dropMove(spot("a", ids), spot("c", ids, { open: true }), "after")).toEqual({ id: "a", to: "c", after: null, place: "first" })
  })
  it("never drops a row on itself, inside its own subtree, or where it already is", () => {
    expect(dropMove(spot("a", ids), spot("a", ids), "inside")).toBeNull()
    expect(canDrop("a", spot("x", ["x"], { parent: "b", ancestors: ["b", "a"] }))).toBe(false)
    expect(dropMove(spot("a", ids), spot("b", ids), "before")).toBeNull()
    expect(dropMove(spot("b", ids), spot("a", ids), "after")).toBeNull()
  })
  it("won't drop inside a row that can't take children", () => {
    expect(dropMove(spot("a", ids), spot("c", ids, { canNest: false }), "inside")).toBeNull()
  })
})

describe("keyMove", () => {
  const ids = ["a", "b", "c"]
  it("swaps with a neighbour, and stops at the ends", () => {
    expect(keyMove(spot("b", ids), "up")).toEqual({ id: "b", to: null, after: null, place: "first" })
    expect(keyMove(spot("c", ids), "up")).toEqual({ id: "c", to: null, after: "a" })
    expect(keyMove(spot("a", ids), "down")).toEqual({ id: "a", to: null, after: "b" })
    expect(keyMove(spot("a", ids), "up")).toBeNull()
    expect(keyMove(spot("c", ids), "down")).toBeNull()
  })
  it("goes inside the row above, and out again after its parent", () => {
    expect(keyMove(spot("b", ids), "indent")).toEqual({ id: "b", to: "a", after: null, place: "last" })
    expect(keyMove(spot("a", ids), "indent")).toBeNull()
    expect(keyMove(spot("b", ids), "indent", { previousCanNest: false })).toBeNull()
    expect(keyMove(spot("x", ["x"], { parent: "a" }), "outdent", { grandparent: "top" })).toEqual({ id: "x", to: "top", after: "a" })
    expect(keyMove(spot("a", ids), "outdent")).toBeNull()
  })
})

describe("moveWithin", () => {
  it("shows a move in the levels it touches", () => {
    expect(moveWithin(["a", "b", "c"], { id: "a", to: null, after: "c" }, true, true)).toEqual(["b", "c", "a"])
    expect(moveWithin(["a", "b", "c"], { id: "c", to: null, after: null, place: "first" }, true, true)).toEqual(["c", "a", "b"])
    expect(moveWithin(["a", "b"], { id: "a", to: "x", after: null, place: "last" }, true, false)).toEqual(["b"])
    expect(moveWithin(["y"], { id: "a", to: "x", after: null }, false, true)).toEqual(["y", "a"])
  })
})
