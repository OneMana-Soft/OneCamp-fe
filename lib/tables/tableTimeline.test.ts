import { describe, expect, it } from "vitest"
import { datesOf, readTimelineLook, spanOfRow, waitsOn } from "./tableTimeline"
import type { TableField } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const f = (id: string, type: string, config: object = {}): TableField => ({ id, table_id: "t", name: id, type: type as TableField["type"], config: JSON.stringify(config), position: 0 })
const fields = [
  f("name", "text"),
  f("starts", "date"),
  f("due", "date"),
  f("after", "relation", { relation_target: "table", table_id: "t" }),
  f("vendor", "relation", { relation_target: "table", table_id: "other" }),
]

describe("B4's timeline look", () => {
  it("takes the table's first two date fields and its first link to its own rows, at a week's zoom, when nothing is kept", () => {
    expect(readTimelineLook(null, fields, "t")).toEqual({ start: "starts", end: "due", deps: "after", zoom: "week" })
  })

  it("keeps what the reader chose, and makes good what is gone or of the wrong kind", () => {
    expect(readTimelineLook({ start: "due", end: "starts", deps: "after", zoom: "month" }, fields, "t")).toEqual({ start: "due", end: "starts", deps: "after", zoom: "month" })
    // A bar of one day, and no arrows: kept as the reader's choice.
    expect(readTimelineLook({ start: "starts", end: null, deps: null }, fields, "t")).toMatchObject({ end: null, deps: null })
    // A text field is no date, a link to another table no dependency, an end the start no end.
    expect(readTimelineLook({ start: "name", end: "starts", deps: "vendor", zoom: "year" }, fields, "t")).toEqual({ start: "starts", end: "due", deps: "after", zoom: "week" })
    expect(readTimelineLook({}, [f("name", "text")], "t")).toEqual({ start: null, end: null, deps: null, zoom: "week" })
  })
})

describe("a row's days", () => {
  const look = readTimelineLook(null, fields, "t")
  it("run from its start to its end, both ends in; an end alone or before the start is one day", () => {
    expect(spanOfRow({ starts: "2026-10-20", due: "2026-10-23" }, look)).toEqual({ start: new Date(2026, 9, 20), end: new Date(2026, 9, 23) })
    expect(spanOfRow({ starts: "2026-10-20" }, look)).toEqual({ start: new Date(2026, 9, 20), end: new Date(2026, 9, 20) })
    expect(spanOfRow({ starts: "2026-10-20", due: "2026-10-18" }, look)).toEqual({ start: new Date(2026, 9, 18), end: new Date(2026, 9, 18) })
    expect(spanOfRow({ due: "2026-10-23" }, look)).toBeNull()
  })

  it("write back as the date cells keep them", () => {
    expect(datesOf({ start: new Date(2026, 9, 21), end: new Date(2026, 9, 24) }, look)).toEqual({ starts: "2026-10-21", due: "2026-10-24" })
    expect(datesOf({ start: new Date(2026, 9, 21), end: new Date(2026, 9, 21) }, { ...look, end: null })).toEqual({ starts: "2026-10-21" })
  })

  it("wait on the rows its link names, never one the reader can't see or the count of more", () => {
    const after = [
      { id: "r1", type: "row", table_id: "t" },
      { id: "r9", type: "row", hidden: true },
      { id: "", type: "more" },
    ]
    expect(waitsOn({ after }, look)).toEqual(["r1"])
    expect(waitsOn({ after }, { ...look, deps: null })).toEqual([])
  })
})
