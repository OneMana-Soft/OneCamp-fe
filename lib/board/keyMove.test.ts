import { describe, expect, it } from "vitest"
import { moveKeyOf, spotLabel, stepSpot } from "@/lib/board/keyMove"

// One row: To do holds 3 cards besides the held one, In progress 1, Done none.
const row = [["todo", "inProgress", "done"]]
const counts: Record<string, number> = { todo: 3, inProgress: 1, done: 0, "a:todo": 2, "a:done": 1, "b:todo": 0, "b:done": 4 }
const count = (k: string) => counts[k] ?? 0

describe("moving a held card with the arrows", () => {
  it("walks down and up its column, to the place below the last card and no further", () => {
    let at = { column: "todo", index: 1 }
    at = stepSpot(row, count, at, "down")
    expect(at).toEqual({ column: "todo", index: 2 })
    at = stepSpot(row, count, at, "down")
    expect(at).toEqual({ column: "todo", index: 3 })
    expect(stepSpot(row, count, at, "down")).toEqual({ column: "todo", index: 3 })
    expect(stepSpot(row, count, { column: "todo", index: 0 }, "up")).toEqual({ column: "todo", index: 0 })
  })

  it("crosses to the next column at the same height, or that column's last place", () => {
    expect(stepSpot(row, count, { column: "todo", index: 0 }, "right")).toEqual({ column: "inProgress", index: 0 })
    expect(stepSpot(row, count, { column: "todo", index: 3 }, "right")).toEqual({ column: "inProgress", index: 1 })
    expect(stepSpot(row, count, { column: "inProgress", index: 1 }, "right")).toEqual({ column: "done", index: 0 })
    expect(stepSpot(row, count, { column: "inProgress", index: 0 }, "left")).toEqual({ column: "todo", index: 0 })
  })

  it("stays put at the board's edges", () => {
    expect(stepSpot(row, count, { column: "todo", index: 2 }, "left")).toEqual({ column: "todo", index: 2 })
    expect(stepSpot(row, count, { column: "done", index: 0 }, "right")).toEqual({ column: "done", index: 0 })
  })

  it("in swimlanes, steps into the lane above or below at a list's ends", () => {
    const lanes = [
      ["a:todo", "a:done"],
      ["b:todo", "b:done"],
    ]
    expect(stepSpot(lanes, count, { column: "a:todo", index: 2 }, "down")).toEqual({ column: "b:todo", index: 0 })
    expect(stepSpot(lanes, count, { column: "b:done", index: 0 }, "up")).toEqual({ column: "a:done", index: 1 })
    expect(stepSpot(lanes, count, { column: "a:todo", index: 1 }, "right")).toEqual({ column: "a:done", index: 1 })
  })

  it("reads the arrows and the J K H L letters", () => {
    expect(["ArrowUp", "k", "ArrowDown", "j", "ArrowLeft", "h", "ArrowRight", "l", "x"].map(moveKeyOf)).toEqual([
      "up", "up", "down", "down", "left", "left", "right", "right", null,
    ])
  })

  it("says where the line is in words", () => {
    expect(spotLabel("In progress", 1, 3)).toBe("In progress, 2 of 4")
  })
})
