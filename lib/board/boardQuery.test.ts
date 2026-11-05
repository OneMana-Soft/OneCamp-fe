import { describe, expect, it } from "vitest"
import { boardQuery, insightsHref } from "./boardQuery"
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

describe("insightsHref (B9-b1)", () => {
  it("opens the overview's Reports on the project, with the view's filters as the board sends them and its name", () => {
    const href = insightsHref("p1", [{ id: "task_priority", value: ["high"] }, { id: DUE_WEEK, value: "1" }], " launch ", "High work")
    const q = new URL(href, "https://x.test").searchParams
    expect(href.startsWith("/app/project?")).toBe(true)
    expect(q.get("view")).toBe("reports")
    expect(q.get("projects")).toBe("p1")
    expect(JSON.parse(q.get("filters") ?? "")).toEqual([{ id: "task_priority", value: ["high"] }, { id: "task_name", value: "launch" }])
    expect(q.get("name")).toBe("High work")
  })
  it("leaves out the filters and the name when a view has none", () => {
    expect(insightsHref("p1", [], "", "")).toBe("/app/project?view=reports&projects=p1")
  })
})
