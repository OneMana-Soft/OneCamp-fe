// The summary bar under a grid (content.md T14): one value per column, worked
// out from the rows the view shows. Numbers sum by default and a checkbox
// counts its ticks; anything else is empty until the reader picks a function.
// Pure.

import { computedOf, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import type { SummaryFn } from "@/lib/tables/display"
import { formatLocale } from "./numberFormat"

export const SUMMARY_LABEL: Record<SummaryFn, string> = {
  none: "None",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  range: "Range",
  count: "Count",
  empty: "Empty",
  filled: "Filled",
  pct_empty: "% empty",
  pct_filled: "% filled",
  checked: "Checked",
  unchecked: "Unchecked",
}

const NUMERIC: SummaryFn[] = ["sum", "average", "median", "min", "max", "range"]
const ANY: SummaryFn[] = ["count", "empty", "filled", "pct_empty", "pct_filled"]

/** Whether a field's values add up as numbers. */
export function numericField(f: TableField): boolean {
  return f.type === "number" || ((f.type === "formula" || f.type === "rollup") && computedOf(f).result === "number")
}

/** Whether a field's values are ticks. */
export function checkField(f: TableField): boolean {
  return f.type === "checkbox" || ((f.type === "formula" || f.type === "rollup") && computedOf(f).result === "checkbox")
}

/** The functions a field's summary may use, in menu order. */
export function summaryChoices(f: TableField): SummaryFn[] {
  if (numericField(f)) return [...NUMERIC, ...ANY]
  if (checkField(f)) return ["checked", "unchecked", ...ANY]
  return ANY
}

/** What a field's summary shows until the reader chooses: numbers sum, checkboxes count ticks. */
export function defaultSummary(f: TableField): SummaryFn {
  if (numericField(f)) return "sum"
  if (checkField(f)) return "checked"
  return "none"
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

const fmt = (n: number) => formatLocale(n, { maximumFractionDigits: 2 })

/** One summary: the label ("Sum") and the value ("3,280"), or null for none. */
export function summarize(f: TableField, rows: TableRow[], fn: SummaryFn, valuesOf: (r: TableRow) => Record<string, unknown> = parseRowValues): { label: string; value: string } | null {
  if (fn === "none") return null
  const vals = rows.map((r) => valuesOf(r)[f.id])
  const total = vals.length
  const label = SUMMARY_LABEL[fn]
  if (fn === "checked" || fn === "unchecked") {
    const ticked = vals.filter((v) => v === true || v === "true").length
    return { label, value: `${fn === "checked" ? ticked : total - ticked} of ${total}` }
  }
  if (fn === "count") return { label, value: fmt(total) }
  const empty = vals.filter(isEmpty).length
  if (fn === "empty") return { label, value: fmt(empty) }
  if (fn === "filled") return { label, value: fmt(total - empty) }
  if (fn === "pct_empty") return { label, value: total ? `${Math.round((empty / total) * 100)}%` : "0%" }
  if (fn === "pct_filled") return { label, value: total ? `${Math.round(((total - empty) / total) * 100)}%` : "0%" }
  const ns = vals.map(num).filter((n): n is number => n !== null)
  if (!ns.length) return { label, value: "–" }
  const sorted = [...ns].sort((a, b) => a - b)
  switch (fn) {
    case "sum":
      return { label, value: fmt(ns.reduce((a, b) => a + b, 0)) }
    case "average":
      return { label, value: fmt(ns.reduce((a, b) => a + b, 0) / ns.length) }
    case "median": {
      const mid = Math.floor(sorted.length / 2)
      return { label, value: fmt(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) }
    }
    case "min":
      return { label, value: fmt(sorted[0]) }
    case "max":
      return { label, value: fmt(sorted[sorted.length - 1]) }
    case "range":
      return { label, value: fmt(sorted[sorted.length - 1] - sorted[0]) }
    default:
      return null
  }
}
