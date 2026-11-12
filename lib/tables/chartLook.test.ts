import { describe, expect, it } from "vitest"
import { CHART_BARS, chartBars, chartSpec, measureWords, readChartLook } from "./chartLook"
import { rulesToSpec } from "./query"
import { groupLabel } from "./groups"
import type { TableField } from "@/services/tableService"
import type { ViewRules } from "@/lib/tables/viewRules"

// The chart's two helpers, as the table's page hands them over: the grid's own query and the grouped list's group names.
const USING = { rulesToSpec, groupLabel }

// A table's chart tells the truth (TABLES-BOARDS-11, UX-TB-H3): its numbers
// come from the view's own rows, through the query the grid asks (POST
// /tables/{id}/query: the view's filter, grouped by the chart's field, the
// measure as each group's summary), and what it draws is kept with the view.
// The chart asked /aggregate for every row and kept its choices in one
// browser, so a filtered view's chart counted rows the view hid.

const f = (id: string, name: string, type: TableField["type"], position: number, config = "{}"): TableField => ({ id, table_id: "t", name, type, config, position })
const ITEM = f("item", "Item", "text", 0)
const AMOUNT = f("amount", "Amount", "number", 1)
const STAGE = f("stage", "Stage", "select", 2, JSON.stringify({ options: [{ id: "o1", label: "Q3" }, { id: "o2", label: "Q4" }] }))
const OWNER = f("owner", "Owner", "people", 3)
const FIELDS = [ITEM, AMOUNT, STAGE, OWNER]
const INDEXED = { indexed: true, sorts_text: true }
const Q4: ViewRules = { sort: [{ field: "item", dir: "asc" }], filters: [{ field: "stage", op: "is", value: "Q4" }], match: "all" }

describe("the look a view keeps for its chart", () => {
  it("groups by the first choice, person or date, counting rows, until one is chosen", () => {
    expect(readChartLook(null, FIELDS)).toEqual({ type: "bar", groupBy: "stage", op: "count", valueField: "amount" })
  })

  it("keeps a chosen look, and lets go of a field the table no longer has", () => {
    expect(readChartLook({ type: "pie", groupBy: "owner", op: "sum", valueField: "amount" }, FIELDS)).toEqual({ type: "pie", groupBy: "owner", op: "sum", valueField: "amount" })
    expect(readChartLook({ type: "donut", groupBy: "gone", op: "median", valueField: "item" }, FIELDS)).toEqual({ type: "bar", groupBy: "stage", op: "count", valueField: "amount" })
  })
})

describe("the chart's words", () => {
  it("say what each bar is: a count of rows, or the measure of a field", () => {
    expect(measureWords("count", AMOUNT)).toBe("Count of rows")
    expect(measureWords("sum", AMOUNT)).toBe("Sum of Amount")
    expect(measureWords("avg", AMOUNT)).toBe("Average of Amount")
    expect(measureWords("min", AMOUNT)).toBe("Lowest Amount")
    expect(measureWords("max", AMOUNT)).toBe("Highest Amount")
  })
})

describe("the chart's query", () => {
  it("is the view's filter, grouped by the chart's field, with no sort, counting each group", () => {
    const spec = chartSpec(USING, Q4, readChartLook(null, FIELDS), FIELDS, INDEXED)
    expect(spec).toEqual({ filter: { op: "and", filters: [{ field: "field:stage", operator: "is", values: [{ text: "Q4" }] }] }, groups: [{ field: "field:stage" }] })
  })

  it("asks each group's sum, average, least or most of the value field", () => {
    for (const [op, fn] of [["sum", "sum"], ["avg", "average"], ["min", "min"], ["max", "max"]] as const) {
      const spec = chartSpec(USING, Q4, { type: "bar", groupBy: "stage", op, valueField: "amount" }, FIELDS, INDEXED)
      expect(spec?.summaries).toEqual([{ field: "field:amount", fns: [fn] }])
    }
  })

  it("is none when the server can't answer it: a table it hasn't indexed, or a field it can't group by", () => {
    expect(chartSpec(USING, Q4, readChartLook(null, FIELDS), FIELDS, { indexed: false, sorts_text: false })).toBeNull()
    expect(chartSpec(USING, Q4, { type: "bar", groupBy: "owner", op: "count", valueField: "amount" }, FIELDS, INDEXED)).toBeNull()
  })
})

describe("the chart's bars", () => {
  const look = readChartLook(null, FIELDS)

  it("are each group's name and count, and the summary the measure asked for", () => {
    const groups = [
      { key: ["Q4"], count: 3, summaries: { "field:amount": { sum: 4200 } } },
      { key: [""], count: 1, summaries: { "field:amount": { sum: null } } },
    ]
    expect(chartBars(USING, groups, look, FIELDS)).toEqual({ labels: ["Q4", "Empty"], values: [3, 1], others: 0 })
    expect(chartBars(USING, groups, { ...look, op: "sum" }, FIELDS)).toEqual({ labels: ["Q4", "Empty"], values: [4200, 0], others: 0 })
  })

  it("are the largest 50, the rest of a count or a sum as one Other", () => {
    const groups = Array.from({ length: 60 }, (_, i) => ({ key: [`G${i}`], count: i + 1 }))
    const bars = chartBars(USING, groups, look, FIELDS)
    expect(bars.labels).toHaveLength(51)
    expect(bars.labels[0]).toBe("G59")
    expect(bars.labels[50]).toBe("Other")
    expect(bars.values[50]).toBe(55) // groups G0..G9: 1+…+10
    expect(bars.others).toBe(10)
    // An average or a least of the rest isn't one number: the rest are left out, and said so (others).
    const avg = chartBars(USING, groups.map((g) => ({ ...g, summaries: { "field:amount": { average: g.count } } })), { ...look, op: "avg" }, FIELDS)
    expect(avg.labels).toHaveLength(50)
    expect(avg.others).toBe(10)
  })

  // CR-252 F1: a sum adds up, so the groups past the largest CHART_BARS are one Other bar of their total, and the bars add up
  // to every group's; the most (or an average, or the least) of them isn't one number: no Other, and the rest said (others).
  it("sum the groups past the largest into one Other of their total, and leave them out of a most", () => {
    const groups = Array.from({ length: CHART_BARS + 10 }, (_, i) => ({ key: [`G${i}`], count: 1, summaries: { "field:amount": { sum: (i + 1) * 10, max: i + 1 } } }))
    const sum = chartBars(USING, groups, { ...look, op: "sum", valueField: "amount" }, FIELDS)
    expect(sum.labels).toHaveLength(CHART_BARS + 1)
    expect(sum.labels[0]).toBe(`G${CHART_BARS + 9}`)
    expect(sum.labels.at(-1)).toBe("Other")
    expect(sum.values.at(-1)).toBe(550) // G0..G9: 10+20+…+100
    expect(sum.values.reduce((t, v) => t + v, 0)).toBe(groups.reduce((t, g) => t + g.summaries["field:amount"].sum, 0))
    expect(sum.others).toBe(10)
    const most = chartBars(USING, groups, { ...look, op: "max", valueField: "amount" }, FIELDS)
    expect(most.labels).toHaveLength(CHART_BARS)
    expect(most.labels).not.toContain("Other")
    expect(most.values[0]).toBe(CHART_BARS + 10)
    expect(most.others).toBe(10)
  })
})
