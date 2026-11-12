// A table's chart as its view keeps it (TABLES-BOARDS-11): what it draws and by what, and its numbers from the
// view's own rows, through the query the grid asks (POST /tables/{id}/query): the view's filter, its rows grouped
// by the chart's field, the measure as each group's summary. Pure.

import { isNumeric, type AggregateOp, type TableField } from "@/services/tableService"
import type { GroupCount } from "@/lib/querySpec/types"
import type { RowQueryAnswers, RowSpec } from "@/lib/tables/query"
import type { ViewRules } from "@/lib/tables/viewRules"

/**
 * The two helpers a chart's numbers need, handed over by the table's page: the grid's own query (lib/tables/query,
 * in the page's chunk) and the grouped list's group names (lib/tables/groups, in the GroupHeaders chunk). Imported
 * here they would tie the chart's lazy chunk to lib/fieldTypes/registry, whose icons the /app shell shares, and
 * re-cut every /app route (UX-TB-H3 size-table-2); taken through the rules chunk they put lib/tables/groups in
 * every chunk that carries lib/tables/applyRules (UX-TB-H3 size-table-5).
 */
export interface ChartRules {
  rulesToSpec: typeof import("@/lib/tables/query").rulesToSpec
  groupLabel: typeof import("@/lib/tables/groups").groupLabel
}

export const CHART_TYPES = ["bar", "line", "area", "pie"] as const
export type ChartType = (typeof CHART_TYPES)[number]
export const CHART_OPS: AggregateOp[] = ["count", "sum", "avg", "min", "max"]

/** What a view's chart draws: its kind, the field it groups rows by, its measure and the number field measured. */
export interface ChartLook {
  type: ChartType
  groupBy: string
  op: AggregateOp
  valueField: string
}

/** The most bars a chart draws; the rest of a count or a sum is one "Other". */
export const CHART_BARS = 50

// What groups rows, for a chart that hasn't chosen: a choice, a person, a date.
const GROUPS = ["status", "select", "multi_select", "people", "person", "date"]

/** The look a view keeps, made good against the table's fields; the first field that groups rows, counted, when there's none. */
export function readChartLook(stored: unknown, fields: TableField[]): ChartLook {
  const byPosition = [...fields].sort((a, b) => a.position - b.position)
  const numbers = byPosition.filter(isNumeric)
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof ChartLook, unknown>>
  const has = (id: unknown, among: TableField[]) => typeof id === "string" && among.some((f) => f.id === id)
  return {
    type: CHART_TYPES.includes(s.type as ChartType) ? (s.type as ChartType) : "bar",
    groupBy: has(s.groupBy, byPosition) ? (s.groupBy as string) : ((byPosition.find((f) => GROUPS.includes(f.type)) ?? byPosition[0])?.id ?? ""),
    op: CHART_OPS.includes(s.op as AggregateOp) ? (s.op as AggregateOp) : "count",
    valueField: has(s.valueField, numbers) ? (s.valueField as string) : (numbers[0]?.id ?? ""),
  }
}

/** The measure in words: "Count of rows", "Sum of Amount", "Average of Amount", "Lowest Amount", "Highest Amount". */
export function measureWords(op: AggregateOp, field?: TableField): string {
  const name = field?.name ?? "a number field"
  return op === "count" ? "Count of rows" : op === "sum" ? `Sum of ${name}` : op === "avg" ? `Average of ${name}` : op === "min" ? `Lowest ${name}` : `Highest ${name}`
}

// The server's summary for each measure (business/RowQuery).
const FN: Record<Exclude<AggregateOp, "count">, string> = { sum: "sum", avg: "average", min: "min", max: "max" }

/** The chart's query: the view's filter, its rows grouped by the chart's field, the measure each group's summary; null when the server can't answer it. */
export function chartSpec(using: ChartRules, rules: ViewRules, look: ChartLook, fields: TableField[], answers: RowQueryAnswers | null | undefined): RowSpec | null {
  const spec = using.rulesToSpec({ ...rules, sort: [], groups: [{ field: look.groupBy, dir: "asc" }] }, fields, answers)
  if (!spec?.groups) return null
  if (look.op !== "count") spec.summaries = [{ field: `field:${look.valueField}`, fns: [FN[look.op]] }]
  return spec
}

/** The bars: each group's name and number, the largest CHART_BARS; the rest of a count or a sum as one Other, else left out (others says how many). */
export function chartBars(using: ChartRules, groups: GroupCount[], look: ChartLook, fields: TableField[]): { labels: string[]; values: number[]; others: number } {
  const by = fields.find((f) => f.id === look.groupBy)
  const value = (g: GroupCount) => {
    if (look.op === "count") return g.count
    const v = g.summaries?.[`field:${look.valueField}`]?.[FN[look.op]]
    return typeof v === "number" ? v : 0
  }
  const all = groups.filter((g) => g.key.length === 1).map((g) => ({ label: by ? using.groupLabel(by, g.key[0]) : g.key[0], value: value(g) }))
  const kept = all.length > CHART_BARS ? [...all].sort((a, b) => b.value - a.value).slice(0, CHART_BARS) : all
  const rest = all.length - kept.length
  const labels = kept.map((b) => b.label)
  const values = kept.map((b) => b.value)
  if (rest > 0 && (look.op === "count" || look.op === "sum")) {
    labels.push("Other")
    values.push(all.reduce((s, b) => s + b.value, 0) - values.reduce((s, v) => s + v, 0))
  }
  return { labels, values, others: rest }
}
