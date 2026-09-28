import { describe, expect, it } from "vitest"
import { dropMovedCard, insertionIndex, placeCard } from "./kanbanDrop"

const c = (id: string) => ({ task_uuid: id })
const board = () => ({ todo: [c("a"), c("b"), c("c")], done: [c("x"), c("y")] })
const ids = (cards: { task_uuid: string }[]) => cards.map((t) => t.task_uuid).join(",")

describe("dropMovedCard", () => {
  it("is false for a card let go where it started, so no request is sent", () => {
    const b = board()
    expect(dropMovedCard(b, placeCard(b, "b", "todo", 1)!, "b")).toBe(false)
  })
  it("is true for a reorder and for a change of column", () => {
    const b = board()
    expect(dropMovedCard(b, placeCard(b, "a", "todo", 2)!, "a")).toBe(true)
    expect(dropMovedCard(b, placeCard(b, "b", "done", 0)!, "b")).toBe(true)
  })
})

describe("placeCard", () => {
  it("moves a card into another column at a position", () => {
    const d = placeCard(board(), "b", "done", 1)!
    expect(ids(d.items.todo)).toBe("a,c")
    expect(ids(d.items.done)).toBe("x,b,y")
    expect(d).toMatchObject({ column: "done", index: 1, before: "x", after: "y" })
  })
  it("reorders within a column, counting positions without the card", () => {
    // a to the end of todo: without a, todo is b,c; index 2 is after c.
    const d = placeCard(board(), "a", "todo", 2)!
    expect(ids(d.items.todo)).toBe("b,c,a")
    expect(d).toMatchObject({ before: "c", after: "" })
  })
  it("clamps an index past the end", () => {
    expect(ids(placeCard(board(), "a", "done", 99)!.items.done)).toBe("x,y,a")
  })
  it("refuses an unknown card or column", () => {
    expect(placeCard(board(), "zz", "done", 0)).toBeNull()
    expect(placeCard(board(), "a", "nowhere", 0)).toBeNull()
  })
  it("leaves the original board untouched", () => {
    const b = board()
    placeCard(b, "a", "done", 0)
    expect(ids(b.todo)).toBe("a,b,c")
  })
})

describe("insertionIndex", () => {
  const mids = [100, 200, 300]
  it("is 0 above the first card's middle and the length below the last", () => {
    expect(insertionIndex(mids, 50)).toBe(0)
    expect(insertionIndex(mids, 350)).toBe(3)
  })
  it("falls between the cards whose middles the pointer is between", () => {
    expect(insertionIndex(mids, 150)).toBe(1)
    expect(insertionIndex(mids, 250)).toBe(2)
  })
  it("is 0 in an empty column", () => {
    expect(insertionIndex([], 500)).toBe(0)
  })
})
