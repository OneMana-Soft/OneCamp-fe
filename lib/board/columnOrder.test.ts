import { describe, expect, it } from "vitest"
import { dropColumn, keepsClosedLast, moveColumn, placesFor, shiftColumn } from "@/lib/board/columnOrder"

// A project's order: Backlog, To do, In progress, QA (its own, in review),
// In review, Done, Shipped (its own, done), Cancelled.
const order = ["backlog", "todo", "inProgress", "qa", "inReview", "done", "shipped", "canceled"]
const closedOnes = new Set(["done", "shipped", "canceled"])
const closed = (v: string) => closedOnes.has(v)

describe("a board's column order", () => {
  it("moves an open column anywhere among the open ones", () => {
    expect(moveColumn(order, "inReview", "todo", closed)).toEqual(["backlog", "inReview", "todo", "inProgress", "qa", "done", "shipped", "canceled"])
    expect(moveColumn(order, "backlog", "done", closed)).toEqual(["todo", "inProgress", "qa", "inReview", "backlog", "done", "shipped", "canceled"])
  })

  it("keeps Done, Cancelled and their own after the open columns", () => {
    expect(moveColumn(order, "done", "inReview", closed)).toBeNull()
    expect(moveColumn(order, "todo", "canceled", closed)).toBeNull()
    expect(moveColumn(order, "todo", null, closed)).toBeNull()
    expect(moveColumn(order, "canceled", "done", closed)).toEqual(["backlog", "todo", "inProgress", "qa", "inReview", "canceled", "done", "shipped"])
    expect(keepsClosedLast(["todo", "done", "inReview"], closed)).toBe(false)
  })

  it("moves nothing onto itself or where it already is", () => {
    expect(moveColumn(order, "todo", "todo", closed)).toBeNull()
    expect(moveColumn(order, "todo", "inProgress", closed)).toBeNull()
    expect(moveColumn(order, "nope", "todo", closed)).toBeNull()
  })

  it("drops into a gap among the columns a person sees, passing no hidden column it needn't", () => {
    // Backlog, In review and Cancelled hidden, as a board starts.
    const shown = ["todo", "inProgress", "qa", "done", "shipped"]
    // In progress put first: before To do, not before the hidden Backlog.
    expect(dropColumn(order, shown, "inProgress", 0, closed)).toEqual(["backlog", "inProgress", "todo", "qa", "inReview", "done", "shipped", "canceled"])
    // To do put after QA: straight after it, before the hidden In review.
    expect(dropColumn(order, shown, "todo", 2, closed)).toEqual(["backlog", "inProgress", "qa", "todo", "inReview", "done", "shipped", "canceled"])
    // Its own gap moves nothing; past the end of the open ones is refused.
    expect(dropColumn(order, shown, "inProgress", 1, closed)).toBeNull()
    expect(dropColumn(order, shown, "todo", 4, closed)).toBeNull()
    expect(placesFor(order, shown, "todo", closed)).toEqual([1, 2])
    expect(placesFor(order, shown, "done", closed)).toEqual([4])
  })

  it("moves one place left or right among the columns shown, and says where it can't", () => {
    const shown = ["todo", "inProgress", "qa", "done", "shipped"]
    expect(shiftColumn(order, shown, "inProgress", -1, closed)).toEqual(["backlog", "inProgress", "todo", "qa", "inReview", "done", "shipped", "canceled"])
    expect(shiftColumn(order, shown, "inProgress", 1, closed)).toEqual(["backlog", "todo", "qa", "inProgress", "inReview", "done", "shipped", "canceled"])
    expect(shiftColumn(order, shown, "todo", -1, closed)).toBeNull()
    expect(shiftColumn(order, shown, "qa", 1, closed)).toBeNull()
    expect(shiftColumn(order, shown, "done", -1, closed)).toBeNull()
    expect(shiftColumn(order, shown, "done", 1, closed)).toEqual(["backlog", "todo", "inProgress", "qa", "inReview", "shipped", "done", "canceled"])
    expect(shiftColumn(order, shown, "shipped", 1, closed)).toBeNull()
  })
})
