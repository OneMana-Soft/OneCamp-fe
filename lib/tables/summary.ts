// The summary bar under a grid (content.md T14): one value per column, worked
// out from the rows the view shows. Numbers sum by default and a checkbox
// counts its ticks; anything else is empty until the reader picks a function.
// Pure.

import { optionsOf, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import type { SummaryFn } from "@/lib/tables/display"
import { formatLocale } from "./numberFormat"
import { shortDate } from "@/lib/utils/date/shortDate"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { STATUS_GROUPS, STATUS_GROUP_NAMES, statusGroupOf, type StatusGroup } from "@/lib/fieldTypes/kindsMore"

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
  groups: "By group",
  span: "Earliest to latest",
}

/** The functions a field's summary may use, in menu order: its kind's (lib/fieldTypes). */
export function summaryChoices(f: TableField): SummaryFn[] {
  return fieldKind(f.type).summaries(f)
}

/** What a field's summary shows until the reader chooses: numbers sum, checkboxes count ticks. */
export function defaultSummary(f: TableField): SummaryFn {
  return fieldKind(f.type).defaultSummary(f)
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  return null
}

const fmtNumber = (n: number) => formatLocale(n, { maximumFractionDigits: 2 })
/** A count, as the summary bar writes one. */
const fmt = fmtNumber

/** A status's rows in each group, in the groups' order: what "By group" counts. */
export function groupCounts(f: TableField, vals: readonly unknown[]): Record<StatusGroup, number> {
  const groupOf = new Map(optionsOf(f).map((o) => [o.label, statusGroupOf(o)]))
  const counts: Record<StatusGroup, number> = { todo: 0, doing: 0, done: 0 }
  for (const v of vals) {
    const g = typeof v === "string" ? groupOf.get(v) : undefined
    if (g) counts[g]++
  }
  return counts
}

/** One summary, as the bar shows it: the label ("Sum") and the value ("3,280"); a title says it in words where the value is terse, and "By group" carries its counts. */
export interface Summary {
  label: string
  value: string
  title?: string
  groups?: Record<StatusGroup, number>
}

/** Earliest to latest, as the bar writes a span (times in ms); a dash for no date. */
function spanOf(lo: number | null, hi: number | null): Summary {
  const label = SUMMARY_LABEL.span
  if (lo === null || hi === null || Number.isNaN(lo) || Number.isNaN(hi)) return { label, value: "–" }
  const first = shortDate(new Date(lo))
  const last = shortDate(new Date(hi))
  return { label: "", value: first === last ? first : `${first} – ${last}`, title: `${label}: ${first === last ? first : `${first} to ${last}`}` }
}

/** A number in a field's footer: a duration sums as one ("12h 30m"), a rating averages with its star. */
function numberIn(f: TableField, x: number): string {
  const numberText = fieldKind(f.type).numberText
  return numberText ? numberText(x, f) : fmtNumber(x)
}

/**
 * One summary as the server worked it out over every row a view keeps
 * (lib/tables/query summariesToSpec asked for it), written as
 * summarizeValues writes its own of the rows loaded: undefined where the
 * server wasn't asked fn, null for none.
 */
export function summarizeServed(f: TableField, fn: SummaryFn, served: Record<string, unknown> | undefined): Summary | null | undefined {
  if (fn === "none") return null
  const v = served?.[fn === "span" ? "range" : fn]
  if (v === undefined) return undefined
  const label = SUMMARY_LABEL[fn]
  switch (fn) {
    case "span":
      return Array.isArray(v) ? spanOf(Date.parse(String(v[0])), Date.parse(String(v[1]))) : spanOf(null, null)
    case "checked":
    case "unchecked":
      return served?.count === undefined ? undefined : { label, value: `${v} of ${served.count}` }
    case "count":
    case "empty":
    case "filled":
      return { label, value: fmt(Number(v)) }
    case "pct_empty":
    case "pct_filled":
      return { label, value: `${Math.round(Number(v))}%` }
  }
  return { label, value: typeof v === "number" ? numberIn(f, v) : "–" }
}

/** One summary of rows, or null for none (summarizeValues, of each row's value in f). */
export function summarize(
  f: TableField,
  rows: TableRow[],
  fn: SummaryFn,
  valuesOf: (r: TableRow) => Record<string, unknown> = parseRowValues,
): Summary | null {
  return fn === "none" ? null : summarizeValues(f, rows.map((r) => valuesOf(r)[f.id]), fn)
}

/**
 * One summary of a column's values, in any order, or null for none. One pass
 * over them, and a sort only for the median: the bar works a column out
 * again on every change to it (FooterColumns), at 100,000 rows.
 */
export function summarizeValues(f: TableField, vals: readonly unknown[], fn: SummaryFn): Summary | null {
  if (fn === "none") return null
  const total = vals.length
  const label = SUMMARY_LABEL[fn]
  if (fn === "groups") {
    const counts = groupCounts(f, vals)
    return {
      label: "",
      value: STATUS_GROUPS.map((g) => fmt(counts[g])).join(" · "),
      title: STATUS_GROUPS.map((g) => `${fmt(counts[g])} ${STATUS_GROUP_NAMES[g].toLowerCase()}`).join(", "),
      groups: counts,
    }
  }
  if (fn === "span") {
    // A loop, not Math.min(...times): spreading 100,000 arguments overflows the stack.
    let lo = Infinity
    let hi = -Infinity
    for (const v of vals) {
      const t = typeof v === "string" ? Date.parse(v) : NaN
      if (Number.isNaN(t)) continue
      if (t < lo) lo = t
      if (t > hi) hi = t
    }
    return lo === Infinity ? spanOf(null, null) : spanOf(lo, hi)
  }
  if (fn === "checked" || fn === "unchecked") {
    let ticked = 0
    for (const v of vals) if (v === true || v === "true") ticked++
    return { label, value: `${fn === "checked" ? ticked : total - ticked} of ${total}` }
  }
  if (fn === "count") return { label, value: fmt(total) }
  let empty = 0
  for (const v of vals) if (isEmpty(v)) empty++
  if (fn === "empty") return { label, value: fmt(empty) }
  if (fn === "filled") return { label, value: fmt(total - empty) }
  if (fn === "pct_empty") return { label, value: total ? `${Math.round((empty / total) * 100)}%` : "0%" }
  if (fn === "pct_filled") return { label, value: total ? `${Math.round(((total - empty) / total) * 100)}%` : "0%" }
  let n = 0
  let sum = 0
  let lo = Infinity
  let hi = -Infinity
  const ns: number[] = []
  for (const v of vals) {
    const x = num(v)
    if (x === null) continue
    n++
    sum += x
    if (x < lo) lo = x
    if (x > hi) hi = x
    if (fn === "median") ns.push(x)
  }
  if (!n) return { label, value: "–" }
  const fmtValue = (x: number) => numberIn(f, x)
  switch (fn) {
    case "sum":
      return { label, value: fmtValue(sum) }
    case "average":
      return { label, value: fmtValue(sum / n) }
    case "median": {
      const sorted = ns.sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return { label, value: fmtValue(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) }
    }
    case "min":
      return { label, value: fmtValue(lo) }
    case "max":
      return { label, value: fmtValue(hi) }
    case "range":
      return { label, value: fmtValue(hi - lo) }
    default:
      return null
  }
}
