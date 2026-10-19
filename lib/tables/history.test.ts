import { describe, expect, it } from "vitest"
import { changeText, historyLines, valueText, whoDid } from "@/lib/tables/history"
import type { HistoryItem } from "@/lib/tables/ledger"
import type { TableField } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const field = (id: string, name: string, type: TableField["type"]): TableField => ({ id, table_id: "t", name, type, config: "{}", position: 0 })
const fields = [field("status", "Status", "select"), field("notes", "Notes", "text"), field("paid", "Paid", "checkbox"), field("tags", "Tags", "multi_select"), field("docs", "Docs", "relation")]
const item = (over: Partial<HistoryItem>): HistoryItem => ({ change_set: "c", kind: "edit", actor_kind: "person", actor_name: "Maya", at: "2026-10-16T10:00:00Z", changes: [], ...over })

describe("a row's history, line by line", () => {
  it("says who changed a cell, from what to what", () => {
    expect(historyLines(item({ changes: [{ field: "status", before: "Open", after: "Won" }] }), fields)).toEqual(["Maya changed Status from Open to Won"])
  })

  it("says a cell set, cleared and ticked as people say it", () => {
    expect(changeText({ field: "notes", after: "Call back" }, fields)).toBe("set Notes to Call back")
    expect(changeText({ field: "notes", before: "Call back", after: "" }, fields)).toBe("cleared Notes")
    expect(changeText({ field: "paid", before: false, after: true }, fields)).toBe("ticked Paid")
    expect(changeText({ field: "paid", before: true, after: false }, fields)).toBe("unticked Paid")
    expect(changeText({ field: "tags", before: ["Q4"], after: ["Q4", "Pune"] }, fields)).toBe("changed Tags from Q4 to Q4, Pune")
    expect(changeText({ field: "gone", before: "x", after: "y" }, fields)).toBe("changed a deleted column from x to y")
  })

  it("names a link to an item by its kind alone, never its title", () => {
    expect(changeText({ field: "docs", after: [{ id: "d1", type: "doc" }] }, fields)).toBe("set Docs to 1 link")
    expect(valueText(fields[4], [{ id: "d1", type: "doc" }, { id: "d2", type: "doc" }])).toBe("2 links")
  })

  it("says what happened to the row itself", () => {
    expect(changeText({ event: "created" }, fields)).toBe("added this row")
    expect(changeText({ event: "deleted" }, fields)).toBe("deleted this row")
    expect(changeText({ event: "restored" }, fields)).toBe("brought this row back")
    expect(changeText({ event: "moved" }, fields)).toBe("moved this row")
    expect(changeText({ field: "docs", event: "links", after: { linked: 2, unlinked: 1 } }, fields)).toBe("linked 2 rows and unlinked 1 in Docs")
  })

  it("says who made it, a person, an agent, AI, an import, or OneCamp", () => {
    expect(whoDid(item({}))).toBe("Maya")
    expect(whoDid(item({ actor_kind: "agent" }))).toBe("An agent for Maya")
    expect(whoDid(item({ actor_kind: "automation", actor_name: undefined }))).toBe("AI")
    expect(whoDid(item({ actor_kind: "import" }))).toBe("Maya's import")
    expect(whoDid(item({ actor_kind: "system", actor_name: undefined }))).toBe("OneCamp")
    expect(whoDid(item({ actor_name: undefined }))).toBe("Someone")
  })

  it("says an undo, a redo or a column's change made it", () => {
    expect(historyLines(item({ kind: "undo", changes: [{ field: "status", before: "Won", after: "Open" }] }), fields)).toEqual(["Maya changed Status from Won to Open (undoing a change)"])
    expect(historyLines(item({ kind: "field", changes: [{ field: "status", before: "Todo", after: "To do" }] }), fields)).toEqual([
      "Maya changed Status from Todo to To do (by changing the column)",
    ])
  })

  it("quotes a long value short", () => {
    const long = "word ".repeat(40)
    expect(valueText(fields[1], long).length).toBe(60)
    expect(valueText(fields[1], long).endsWith("…")).toBe(true)
  })
})
