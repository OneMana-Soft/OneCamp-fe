import { describe, expect, it } from "vitest"
import type { FieldType, TableField } from "@/services/tableService"
import { FIELD_KINDS, fieldKind, filterKind } from "./registry"

const field = (type: FieldType, config: Record<string, unknown> = {}): TableField => ({
  id: "f",
  table_id: "t",
  name: "Cost",
  type,
  config: JSON.stringify(config),
  position: 0,
})

describe("the web's field kinds", () => {
  it("are the server's kinds (business/FieldTypes registry.go), each once", () => {
    const ids = FIELD_KINDS.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(
      [
        "checkbox", "date", "email", "formula", "multi_select", "number", "person", "relation", "rollup", "select", "text", "url",
        // Tables B1's (D-TB-3).
        "status", "people", "long_text", "phone", "duration", "rating", "autonumber", "created_time", "created_by", "modified_time", "modified_by",
        // Tables T-AT's files.
        "attachment",
      ].sort(),
    )
  })

  it("offer each in its group of the new column menu, the old person kind aside", () => {
    const offered = FIELD_KINDS.filter((k) => k.offered)
    expect(offered.map((k) => k.id)).not.toContain("person")
    // Groups in order, never interleaved: the menu draws a header where one starts.
    const groups = offered.map((k) => k.group).filter((g, i, all) => all.indexOf(g) === i)
    expect(groups).toEqual(["Basic", "Advanced", "About each row"])
    expect(offered.filter((k) => k.group === "About each row").map((k) => k.id)).toEqual(["autonumber", "created_time", "created_by", "modified_time", "modified_by"])
    expect(offered.filter((k) => k.group === "About each row").every((k) => k.fromRow && !k.stored)).toBe(true)
  })

  it("read a kind this web doesn't know yet as text", () => {
    expect(fieldKind("barcode" as FieldType).id).toBe("text")
  })

  it("say which cells are stored, and which are worked out on each read", () => {
    expect(FIELD_KINDS.filter((k) => !k.stored).map((k) => k.id)).toEqual(["formula", "rollup", "autonumber", "created_time", "created_by", "modified_time", "modified_by"])
  })

  it("let a new row start with a value only where a cell can hold one the settings can pick", () => {
    expect(FIELD_KINDS.filter((k) => k.defaults).map((k) => k.id)).toEqual(["text", "number", "select", "status", "date", "checkbox", "url", "email", "phone", "long_text", "person", "duration", "rating"])
  })

  it("read typed numbers, and say why one isn't", () => {
    const parse = fieldKind("number").parse!
    expect(parse("1,200.5", field("number"), "en-US")).toEqual({ value: 1200.5 })
    expect(parse("", field("number"), "en-US")).toEqual({ value: "" })
    expect(parse("12 kg", field("number"), "en-US")).toEqual({ error: '"Cost" takes a number: "12 kg" isn\'t one' })
  })

  it("leave a kind picked from a list or a calendar without a parser", () => {
    for (const id of ["select", "multi_select", "date", "checkbox", "relation", "formula", "rollup"] as FieldType[]) expect(fieldKind(id).parse, id).toBeUndefined()
  })

  it("compare a formula or a rollup by what it gives", () => {
    expect(filterKind(field("formula", { result: "number" }))).toBe("number")
    expect(filterKind(field("formula", { result: "checkbox" }))).toBe("checkbox")
    expect(filterKind(field("rollup", { result: "date" }))).toBe("date")
    expect(filterKind(field("multi_select"))).toBe("list")
    expect(filterKind(field("select"))).toBe("text")
  })

  it("sum a number column and count ticks in a checkbox column until the reader chooses", () => {
    expect(fieldKind("number").defaultSummary(field("number"))).toBe("sum")
    expect(fieldKind("checkbox").defaultSummary(field("checkbox"))).toBe("checked")
    expect(fieldKind("text").defaultSummary(field("text"))).toBe("none")
    expect(fieldKind("formula").defaultSummary(field("formula", { result: "number" }))).toBe("sum")
    expect(fieldKind("text").summaries(field("text"))).not.toContain("sum")
    expect(fieldKind("number").summaries(field("number"))).toContain("median")
  })

  it("read the B1 kinds' typing as the server does, and say why it isn't one", () => {
    expect(fieldKind("duration").parse!("90", field("duration"), "en-US")).toEqual({ value: 5400 })
    expect(fieldKind("duration").parse!("1h30", field("duration"), "en-US")).toEqual({ value: 5400 })
    expect(fieldKind("duration").parse!("soon", field("duration"), "en-US")).toEqual({ error: '"Cost" takes a duration, such as 90, 1:30 or 1h 30m: "soon" isn\'t one' })
    expect(fieldKind("rating").parse!("9", field("rating", { max: 10 }), "en-US")).toEqual({ value: 9 })
    expect(fieldKind("rating").parse!("9", field("rating"), "en-US")).toEqual({ error: '"Cost" is rated from 1 to 5: "9" isn\'t a rating' })
    expect(fieldKind("phone").parse!("call me", field("phone"), "en-US")).toEqual({ error: '"Cost" takes a phone number: "call me" isn\'t one' })
  })

  it("add up the B1 kinds as STEP5's spec E says", () => {
    expect(fieldKind("status").defaultSummary(field("status"))).toBe("groups")
    expect(fieldKind("people").defaultSummary(field("people"))).toBe("filled")
    expect(fieldKind("phone").defaultSummary(field("phone"))).toBe("filled")
    expect(fieldKind("duration").defaultSummary(field("duration"))).toBe("sum")
    expect(fieldKind("rating").defaultSummary(field("rating"))).toBe("average")
    expect(fieldKind("created_time").defaultSummary(field("created_time"))).toBe("span")
    expect(fieldKind("created_by").defaultSummary(field("created_by"))).toBe("none")
    expect(fieldKind("duration").numberText!(45000, field("duration"))).toBe("12h 30m")
    expect(fieldKind("rating").numberText!(3.84, field("rating"))).toBe("3.8 ★")
    expect(filterKind(field("duration"))).toBe("number")
    expect(filterKind(field("created_time"))).toBe("date")
    expect(filterKind(field("people"))).toBe("list")
  })
})
