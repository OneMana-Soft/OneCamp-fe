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
  it("are the server's twelve (business/FieldTypes registry.go), each once", () => {
    const ids = FIELD_KINDS.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(
      ["checkbox", "date", "email", "formula", "multi_select", "number", "person", "relation", "rollup", "select", "text", "url"].sort(),
    )
  })

  it("read a kind this web doesn't know yet as text", () => {
    expect(fieldKind("barcode" as FieldType).id).toBe("text")
  })

  it("say which cells are stored, and which are worked out on each read", () => {
    expect(FIELD_KINDS.filter((k) => !k.stored).map((k) => k.id)).toEqual(["formula", "rollup"])
  })

  it("let a new row start with a value only where a cell can hold one the settings can pick", () => {
    expect(FIELD_KINDS.filter((k) => k.defaults).map((k) => k.id)).toEqual(["text", "number", "select", "date", "checkbox", "url", "email", "person"])
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
})
