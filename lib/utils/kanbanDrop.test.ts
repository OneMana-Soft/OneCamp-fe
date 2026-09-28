import { describe, expect, it } from "vitest"
import { dropMovedCard, settleDrop } from "./kanbanDrop"

const c = (id: string) => ({ task_uuid: id })
const board = () => ({ todo: [c("a"), c("b"), c("c")], done: [c("x"), c("y")] })
const ids = (cards: { task_uuid: string }[]) => cards.map((t) => t.task_uuid).join(",")

describe("settleDrop", () => {
  it("reorders within a column at the drop, and names the new neighbours", () => {
    const d = settleDrop(board(), "a", "c")!
    expect(ids(d.items.todo)).toBe("b,c,a")
    expect(d).toMatchObject({ column: "todo", index: 2, before: "c", after: "" })
  })

  it("moves up as well as down", () => {
    const d = settleDrop(board(), "c", "a")!
    expect(ids(d.items.todo)).toBe("c,a,b")
    expect(d).toMatchObject({ index: 0, before: "", after: "a" })
  })

  it("keeps a card that crossed columns during the drag where onDragOver put it", () => {
    // onDragOver has already moved b into done, between x and y.
    const during = { todo: [c("a"), c("c")], done: [c("x"), c("b"), c("y")] }
    const d = settleDrop(during, "b", "b")!
    expect(ids(d.items.done)).toBe("x,b,y")
    expect(d).toMatchObject({ column: "done", before: "x", after: "y" })
  })

  it("dropped on a column's empty space, the card stays where it is in that column", () => {
    const during = { todo: [c("a"), c("c")], done: [c("x"), c("y"), c("b")] }
    const d = settleDrop(during, "b", "done")!
    expect(d).toMatchObject({ column: "done", index: 2, before: "y", after: "" })
  })

  it("into an empty column", () => {
    const during = { todo: [c("a")], done: [c("b")] }
    expect(settleDrop(during, "b", "done")).toMatchObject({ column: "done", index: 0, before: "", after: "" })
  })

  it("refuses a drop that does not place the card", () => {
    expect(settleDrop(board(), "a", "nowhere")).toBeNull()
    // Over another column's card but the card was not moved there: stale state.
    expect(settleDrop(board(), "a", "x")).toBeNull()
  })

  it("does not copy the board when nothing moved", () => {
    const b = board()
    expect(settleDrop(b, "b", "b")!.items).toBe(b)
  })
})

describe("dropMovedCard", () => {
  it("is false for a card let go where it started, so no request is sent", () => {
    const b = board()
    expect(dropMovedCard(b, settleDrop(b, "b", "b")!, "b")).toBe(false)
  })
  it("is true for a reorder and for a change of column", () => {
    const b = board()
    expect(dropMovedCard(b, settleDrop(b, "a", "c")!, "a")).toBe(true)
    const during = { todo: [c("a"), c("c")], done: [c("b"), c("x"), c("y")] }
    expect(dropMovedCard(b, settleDrop(during, "b", "done")!, "b")).toBe(true)
  })
})
