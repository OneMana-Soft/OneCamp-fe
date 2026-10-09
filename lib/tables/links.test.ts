import { describe, expect, it } from "vitest"
import { canRollUp, rollupOptions, tableRelations } from "@/lib/tables/links"
import { kindOfField } from "@/lib/tables/viewRules"
import { computedOf, fieldProblem, isComputed, relationOf, rollupOf, type TableField } from "@/services/tableService"

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({
  id,
  table_id: "t",
  name: id,
  type,
  config: JSON.stringify(config),
  position: 0,
})

describe("a rollup", () => {
  it("offers the ways of adding up that fit the field, likeliest first", () => {
    expect(rollupOptions("number")[0]).toBe("sum")
    expect(rollupOptions("date").slice(0, 2)).toEqual(["earliest", "latest"])
    expect(rollupOptions("checkbox")).toEqual(["checked", "count"])
    expect(rollupOptions("text")).not.toContain("sum")
    // With no field, it counts the rows.
    expect(rollupOptions(null)).toEqual(["count"])
  })

  it("can't add up another rollup, or links to a table", () => {
    expect(canRollUp(field("cost", "number"))).toBe(true)
    expect(canRollUp(field("tasks", "relation", { relation_target: "task" }))).toBe(true)
    expect(canRollUp(field("spend", "rollup"))).toBe(false)
    expect(canRollUp(field("vendor", "relation", { relation_target: "table", table_id: "v" }))).toBe(false)
  })

  it("reads relations that link to a table's rows", () => {
    const fields = [field("vendor", "relation", { relation_target: "table", table_id: "v" }), field("work", "relation", { relation_target: "task" }), field("cost", "number")]
    expect(tableRelations(fields).map((f) => f.id)).toEqual(["vendor"])
  })
})

describe("a field's settings, as the server sends them", () => {
  it("say which table a relation links to, and from which side", () => {
    const other = field("budget", "relation", { relation_target: "table", table_id: "b", table_name: "Budget", inverse_of: "vendor" })
    expect(relationOf(other)).toEqual({ target: "table", tableId: "b", tableName: "Budget", inverseOf: "vendor", error: undefined })
    expect(relationOf(field("old", "relation")).target).toBe("any")
  })

  it("say what a rollup gives, and why it can't be worked out", () => {
    const spend = field("spend", "rollup", { relation: "budget", field: "cost", aggregate: "sum", result: "number" })
    expect(rollupOf(spend)).toEqual({ relation: "budget", field: "cost", aggregate: "sum", result: "number", error: undefined })
    expect(isComputed(spend)).toBe(true)
    expect(computedOf(spend).result).toBe("number")
    expect(kindOfField(spend)).toBe("number")
    const broken = field("gone", "rollup", { relation: "x", aggregate: "count", result: "number", error: "The relation this adds up has been deleted" })
    expect(fieldProblem(broken)).toBe("The relation this adds up has been deleted")
    expect(fieldProblem(field("v", "relation", { relation_target: "table", table_id: "v", error: "The table this links to has been deleted" }))).toBe(
      "The table this links to has been deleted",
    )
    expect(fieldProblem(field("cost", "number"))).toBeUndefined()
  })
})
