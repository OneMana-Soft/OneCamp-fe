// A view's rules as the server's query (tables T5c): the spec POST
// /tables/{id}/query answers windows of (business/QuerySpec's shape; the
// server sets its scope to the table), or null when a rule can't go to the
// server yet and the browser keeps the view. The two mean the same:
// testdata/rowquery/meanings.json holds rulesToSpec, applyViewRules and the
// server's evaluator to one table's answers.

import { computedOf, isComputed, type FieldType, type TableField } from "@/services/tableService"
import type { QueryGroup, QuerySummaryRequest } from "@/lib/querySpec/types"
import type { SummaryFn } from "@/lib/tables/display"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { fitRules, isDay, isGroup, ME, takesMe, type FilterEntry, type FilterRule, type ViewRules } from "@/lib/tables/viewRules"
import { typedNumber } from "@/lib/format/number"
import { goTrim } from "@/lib/utils/goText"

/** What a table's cell index answers (its bundle's row_query): a reader asks the server only that. */
export interface RowQueryAnswers {
  /** Filters and sorts, at any depth of its rows. */
  indexed: boolean
  /** Sorts on a text or a choice too, by the natural key. */
  sorts_text: boolean
}

export type SpecValue = { text: string } | { number: number }
export interface SpecCondition {
  field: string
  operator: string
  values?: SpecValue[]
}
export interface SpecGroup {
  op: "and" | "or" | "not"
  filters: SpecFilter[]
}
export type SpecFilter = SpecGroup | SpecCondition
export interface RowSpec {
  filter?: SpecGroup
  groups?: QueryGroup[]
  sorts?: { field: string; desc?: true }[]
  /** What the summary bar shows, worked out over every row the view keeps: asked beside a first window's count alone. */
  summaries?: QuerySummaryRequest[]
}

// The kinds the server reads as the browser does (business/RowQuery
// fields.go). People (but for me) and links stay in the browser: their
// filters name people and rows by name. A formula or a rollup goes as what
// it gives (typeOf; airtable-03: the server keeps it or works it out per
// read, and past what it can work out refuses in its own words).
const TEXT = new Set<FieldType>(["text", "long_text", "url", "email", "phone"])
const CHOICE = new Set<FieldType>(["select", "status"])
const NUMBER = new Set<FieldType>(["number", "duration", "rating", "autonumber"])
const DATE = new Set<FieldType>(["date", "created_time", "modified_time"])
// A list's "has" is the server's "is" (label equality, as the browser's).
const LIST = new Set<FieldType>(["multi_select", "attachment"])

const ref = (f: TableField) => `field:${f.id}`

/** The type the server compares a field's cells as: a formula's or a rollup's what it gives (a number, text, a tick or a date), and null for one that can't be worked out, which stays in the browser to show its error. */
function typeOf(f: TableField): FieldType | null {
  if (!isComputed(f)) return f.type
  const { result, error } = computedOf(f)
  return error ? null : result
}

/** A filter as a condition; "all" for one that hides nothing (not filled in, or not a number or a day); null for one the server can't take. */
function conditionOf(f: TableField, r: FilterRule): SpecFilter | "all" | null {
  if (takesMe(f) && r.value === ME && (r.op === "contains" || r.op === "not_contains"))
    return { field: ref(f), operator: r.op === "contains" ? "is" : "is_not", values: [{ text: ME }] }
  const type = typeOf(f)
  if (type === null || !(TEXT.has(type) || CHOICE.has(type) || NUMBER.has(type) || DATE.has(type) || LIST.has(type) || type === "checkbox")) return null
  if (r.op === "empty" || r.op === "not_empty" || r.op === "checked" || r.op === "unchecked") return { field: ref(f), operator: r.op }
  const want = goTrim(r.value ?? "")
  if (want === "") return "all"
  if (NUMBER.has(type)) {
    const n = typedNumber(want)
    return n === null ? "all" : { field: ref(f), operator: r.op, values: [{ number: n }] }
  }
  if (DATE.has(type)) return isDay(want) ? { field: ref(f), operator: r.op, values: [{ text: want }] } : "all"
  const values = [{ text: want }]
  if (LIST.has(type)) return { field: ref(f), operator: r.op === "not_contains" ? "is_not" : "is", values }
  return { field: ref(f), operator: r.op, values }
}

/** Filters as the spec's: "all" for those that hide nothing, null when one can't go to the server. A group of one is that one. */
function filtersOf(es: FilterEntry[], match: ViewRules["match"], byId: Map<string, TableField>): SpecFilter[] | "all" | null {
  const out: SpecFilter[] = []
  let everyRow = false
  for (const e of es) {
    const s = isGroup(e) ? filtersOf(e.filters, e.match, byId) : conditionOf(byId.get(e.field) as TableField, e)
    if (s === null) return null
    // Any one filter that hides nothing shows every row.
    if (s === "all") everyRow ||= match === "any"
    else if (!Array.isArray(s)) out.push(s)
    else out.push(s.length === 1 ? s[0] : { op: isGroup(e) && e.match === "any" ? "or" : "and", filters: s })
  }
  return everyRow || out.length === 0 ? "all" : out
}

/**
 * The summary bar's choices as the server's summaries, by its names ("span"
 * is a date's range; a tick's count comes with its ticks). A formula's or a
 * rollup's go as what it gives (airtable-03): the server works them out over
 * every row the reader may see, as a stored field's, and never the rows
 * loaded. A status's groups, and a choice its field no longer offers, stay
 * with the rows loaded; a formula or a rollup that can't be worked out shows
 * its error. A view with no summaries chosen (chosen null) asks only its
 * colour scales' least and most.
 */
export function summariesToSpec(fields: TableField[], chosen: Record<string, SummaryFn> | null, hidden: readonly string[], colors?: unknown): QuerySummaryRequest[] {
  const out: QuerySummaryRequest[] = []
  // A colour scale's least and most, of the whole view (applyRules cellTints).
  const sc = (colors as { scales?: unknown } | null)?.scales
  const scaled = new Set(Array.isArray(sc) ? sc.map((x) => x?.field) : [])
  for (const f of fields) {
    if (hidden.includes(f.id) || !summedByServer(f)) continue
    const kind = fieldKind(f.type)
    const fn = chosen ? chosen[f.id] ?? kind.defaultSummary(f) : "none"
    const fns = !askedOfServer(f, fn) ? [] : fn === "span" ? ["range"] : fn === "checked" || fn === "unchecked" ? [fn, "count"] : [fn]
    if (scaled.has(f.id) && kind.summaries(f).includes("min")) fns.push(...["min", "max"].filter((x) => !fns.includes(x)))
    if (fns.length) out.push({ field: ref(f), fns })
  }
  return out
}

/** Whether the server sums a field: a stored one, a row's stamp, or a formula or a rollup it can work out. */
function summedByServer(f: TableField): boolean {
  if (isComputed(f)) return typeOf(f) !== null
  const kind = fieldKind(f.type)
  return !!kind.stored || !!kind.fromRow
}

/** Whether a column's summary is asked of the server (summariesToSpec): one its kind offers, not none or a status's groups. A footer waits only for one asked. */
export function askedOfServer(f: TableField, fn: SummaryFn): boolean {
  return fn !== "none" && fn !== "groups" && summedByServer(f) && fieldKind(f.type).summaries(f).includes(fn)
}

/** A view's rules as the server's query; null when a rule can't go to it, or the table's index can't answer. */
export function rulesToSpec(rules: ViewRules, fields: TableField[], answers: RowQueryAnswers | null | undefined): RowSpec | null {
  if (!answers?.indexed) return null
  const fitted = fitRules(rules, fields)
  const byId = new Map(fields.map((f) => [f.id, f]))
  const spec: RowSpec = {}
  // Whether the server orders by a field: text and a choice by their sort keys. Groups lead (groups.go), by a choice, a tick, a number or a date.
  const orders = (f: TableField, text: boolean) => {
    const type = typeOf(f)
    if (type === null) return false
    return (text && TEXT.has(type)) || CHOICE.has(type) ? answers.sorts_text : NUMBER.has(type) || DATE.has(type) || type === "checkbox"
  }
  const groups: QueryGroup[] = []
  for (const g of fitted.groups ?? []) {
    const f = byId.get(g.field) as TableField
    if (!orders(f, false)) return null
    groups.push({ field: ref(f), ...(g.dir === "desc" && { desc: true }), ...(g.granularity && { granularity: g.granularity }) })
  }
  const sorts: NonNullable<RowSpec["sorts"]> = []
  for (const s of fitted.sort) {
    const f = byId.get(s.field) as TableField
    if (!orders(f, true)) return null
    sorts.push(s.dir === "desc" ? { field: ref(f), desc: true } : { field: ref(f) })
  }
  const filters = filtersOf(fitted.filters, fitted.match, byId)
  if (filters === null) return null
  if (filters !== "all") spec.filter = { op: fitted.match === "any" ? "or" : "and", filters }
  if (groups.length > 0) spec.groups = groups
  if (sorts.length > 0) spec.sorts = sorts
  return spec
}
