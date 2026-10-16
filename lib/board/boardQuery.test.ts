import { describe, expect, it } from "vitest"
import { boardQuery } from "./boardQuery"
import { DUE_WEEK } from "@/lib/tasks/listAddress"

const sent = (q: string) => JSON.parse(new URLSearchParams(q).get("filters") ?? "[]")

describe("a board's request from the shared toolbar (PTC-6)", () => {
  it("is empty when nothing narrows the board, so the default board keeps one cache key", () => {
    expect(boardQuery([], "")).toBe("")
    expect(boardQuery([], "   ")).toBe("")
  })

  it("sends the toolbar's filters as the list does, and its search as a name filter", () => {
    const q = boardQuery(
      [
        { id: "task_status", value: ["todo"] },
        { id: "task_assignee_name", value: ["0x1a"] },
        { id: "task_cycle", value: ["c1"] },
      ],
      " launch ",
    )
    expect(sent(q)).toEqual([
      { id: "task_status", value: ["todo"] },
      { id: "task_assignee_name", value: ["0x1a"] },
      { id: "task_cycle", value: ["c1"] },
      { id: "task_name", value: "launch" },
    ])
  })

  it("leaves out a filter only the list draws", () => {
    expect(boardQuery([{ id: DUE_WEEK, value: true }], "")).toBe("")
  })
})
