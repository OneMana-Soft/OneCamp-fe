// Sorting and filtering a table's rows: the rules a reader sets above the grid,
// board and calendar, kept in their browser for that table. Pure, so the views
// and their tests share one reading of a cell.

import { isHiddenRef, isMoreRef, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { typedNumber } from "@/lib/format/number"
import { filterKind } from "@/lib/fieldTypes/registry"
import type { FilterKind } from "@/lib/fieldTypes/types"

export type SortRule = { field: string; dir: "asc" | "desc" }
export type FilterOp =
  | "contains"
  | "not_contains"
  | "is"
  | "is_not"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "before"
  | "after"
  | "empty"
  | "not_empty"
  | "checked"
  | "unchecked"
export type FilterRule = { field: string; op: FilterOp; value?: string }
export interface ViewRules {
  sort: SortRule[]
  filters: FilterRule[]
  /** Whether a row must pass every filter, or any one. */
  match: "all" | "any"
}

export const NO_RULES: ViewRules = { sort: [], filters: [], match: "all" }


/** The filters a kind of field takes, as the filter menu lists them. */
export const OPS_FOR: Record<FilterKind, { op: FilterOp; label: string; needsValue: boolean }[]> = {
  text: [
    { op: "contains", label: "contains", needsValue: true },
    { op: "not_contains", label: "doesn't contain", needsValue: true },
    { op: "is", label: "is", needsValue: true },
    { op: "is_not", label: "is not", needsValue: true },
    { op: "empty", label: "is empty", needsValue: false },
    { op: "not_empty", label: "is not empty", needsValue: false },
  ],
  number: [
    { op: "is", label: "=", needsValue: true },
    { op: "is_not", label: "≠", needsValue: true },
    { op: "gt", label: ">", needsValue: true },
    { op: "lt", label: "<", needsValue: true },
    { op: "gte", label: "≥", needsValue: true },
    { op: "lte", label: "≤", needsValue: true },
    { op: "empty", label: "is empty", needsValue: false },
    { op: "not_empty", label: "is not empty", needsValue: false },
  ],
  date: [
    { op: "is", label: "is", needsValue: true },
    { op: "before", label: "is before", needsValue: true },
    { op: "after", label: "is after", needsValue: true },
    { op: "empty", label: "is empty", needsValue: false },
    { op: "not_empty", label: "is not empty", needsValue: false },
  ],
  checkbox: [
    { op: "checked", label: "is ticked", needsValue: false },
    { op: "unchecked", label: "is not ticked", needsValue: false },
  ],
  list: [
    { op: "contains", label: "has", needsValue: true },
    { op: "not_contains", label: "doesn't have", needsValue: true },
    { op: "empty", label: "is empty", needsValue: false },
    { op: "not_empty", label: "is not empty", needsValue: false },
  ],
}

/** A cell's labels: a list's items, a link's or a person's name, or the value. A formula's error has none, nor a count of links not shown. */
function labels(v: unknown): string[] {
  if (v === null || v === undefined || v === "" || isMoreRef(v)) return []
  if (Array.isArray(v)) return v.flatMap(labels)
  if (typeof v === "object") {
    const o = v as { label?: unknown; name?: unknown }
    const label = typeof o.label === "string" ? o.label : typeof o.name === "string" ? o.name : ""
    return label ? [label] : []
  }
  return [String(v)]
}

/** A stored cell as a number (what a program wrote: 1200, "1200", "1,200"). */
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** A date cell as its day, "2026-10-12", which orders as text does. */
function asDay(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}

/** Whether a cell has nothing to sort by: it's blank, or it's a link cell naming none of its links. */
const unnamed = (kind: FilterKind, v: unknown) =>
  kind === "checkbox" ? false : kind === "number" ? asNumber(v) === null : kind === "date" ? asDay(v) === null : labels(v).length === 0

/** Whether a cell is empty: a link cell counting links it doesn't name, or holding ones the reader can't open, has links. */
const isBlank = (kind: FilterKind, v: unknown) => unnamed(kind, v) && !(Array.isArray(v) && v.some((x) => isMoreRef(x) || isHiddenRef(x)))

function passes(kind: FilterKind, v: unknown, rule: FilterRule): boolean {
  const want = (rule.value ?? "").trim()
  switch (rule.op) {
    case "empty":
      return isBlank(kind, v)
    case "not_empty":
      return !isBlank(kind, v)
    case "checked":
      return v === true
    case "unchecked":
      return v !== true
  }
  if (want === "") return true // a filter not filled in yet hides nothing
  if (kind === "number") {
    const n = asNumber(v)
    // What the reader typed, read in their locale: "1,5" is 1.5 in de-DE,
    // never 15 (TAB-BUG-8 in the filter box).
    const w = typedNumber(want)
    if (w === null) return true
    if (n === null) return rule.op === "is_not"
    switch (rule.op) {
      case "is":
        return n === w
      case "is_not":
        return n !== w
      case "gt":
        return n > w
      case "lt":
        return n < w
      case "gte":
        return n >= w
      case "lte":
        return n <= w
    }
    return true
  }
  if (kind === "date") {
    const d = asDay(v)
    if (d === null) return false
    switch (rule.op) {
      case "is":
        return d === want
      case "before":
        return d < want
      case "after":
        return d > want
    }
    return true
  }
  const have = labels(v).map((l) => l.toLowerCase())
  const w = want.toLowerCase()
  switch (rule.op) {
    case "contains":
      return kind === "list" ? have.includes(w) : have.join(", ").includes(w)
    case "not_contains":
      return kind === "list" ? !have.includes(w) : !have.join(", ").includes(w)
    case "is":
      return have.join(", ") === w
    case "is_not":
      return have.join(", ") !== w
  }
  return true
}

/** Compares two cells for sorting, ascending; blanks are left to the caller. */
function compareCells(kind: FilterKind, a: unknown, b: unknown): number {
  switch (kind) {
    case "number":
      return (asNumber(a) ?? 0) - (asNumber(b) ?? 0)
    case "date": {
      const x = asDay(a) ?? ""
      const y = asDay(b) ?? ""
      return x < y ? -1 : x > y ? 1 : 0
    }
    case "checkbox":
      return Number(a === true) - Number(b === true)
    default:
      return labels(a).join(", ").localeCompare(labels(b).join(", "), undefined, { numeric: true, sensitivity: "base" })
  }
}

/**
 * The rows the rules show, in the order they say. Filters and sorts on a
 * field that's gone are ignored; blanks sort last either way; rows that tie
 * keep their order. With no rules, the rows come back as they were given.
 */
export function applyViewRules(rows: TableRow[], fields: TableField[], rules: ViewRules): TableRow[] {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const filters = rules.filters.filter((r) => fits(byId.get(r.field), r))
  const sorts = rules.sort.filter((r) => byId.has(r.field))
  if (filters.length === 0 && sorts.length === 0) return rows
  let out = rows.map((row) => ({ row, values: parseRowValues(row) }))
  if (filters.length > 0) {
    out = out.filter(({ values }) => {
      const check = (r: FilterRule) => passes(filterKind(byId.get(r.field)!), values[r.field], r)
      return rules.match === "any" ? filters.some(check) : filters.every(check)
    })
  }
  if (sorts.length > 0) {
    out = out
      .map((x, i) => ({ ...x, i }))
      .sort((x, y) => {
        for (const s of sorts) {
          const kind = filterKind(byId.get(s.field)!)
          const a = x.values[s.field]
          const b = y.values[s.field]
          const ab = unnamed(kind, a)
          const bb = unnamed(kind, b)
          if (ab !== bb) return ab ? 1 : -1
          if (ab) continue
          const c = compareCells(kind, a, b)
          if (c !== 0) return s.dir === "asc" ? c : -c
        }
        return x.i - y.i
      })
  }
  return out.map((x) => x.row)
}

/** The rows with the text in any cell, in any case; every row when it's blank. */
export function searchRows(rows: TableRow[], query: string): TableRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => JSON.stringify(Object.values(parseRowValues(r))).toLowerCase().includes(q))
}

/** Why a row kept in sight isn't where the view's rules would have it. */
export const KEPT_NOTE = {
  filter: "Hidden by the view's filter",
  search: "Doesn't match the search",
  sort: "Sorted elsewhere by the view",
} as const

/**
 * The rows a view shows, with one row (just added) kept last, where it was
 * added, whatever the view's filter, search or sort say, and why it's out of
 * place (KEPT_NOTE's key). The rows as given when it's already last, or
 * isn't held.
 */
export function keepInSight(
  shown: TableRow[],
  ruled: TableRow[],
  held: TableRow[],
  id: string | null,
): { rows: TableRow[]; kept: keyof typeof KEPT_NOTE | null } {
  const at = id ? shown.findIndex((r) => r.id === id) : -1
  const row = at >= 0 ? shown[at] : id ? held.find((r) => r.id === id) : undefined
  if (!row || (at >= 0 && at === shown.length - 1)) return { rows: shown, kept: null }
  if (at >= 0) return { rows: [...shown.filter((r) => r.id !== id), row], kept: "sort" }
  return { rows: [...shown, row], kept: ruled.some((r) => r.id === id) ? "search" : "filter" }
}

/** Whether a filter still fits its field: the field is there, and takes that condition (a field's type can change). */
function fits(field: TableField | undefined, rule: FilterRule): boolean {
  return !!field && OPS_FOR[filterKind(field)].some((o) => o.op === rule.op)
}

/** A table's rules without any for fields that are gone, or filters that no longer fit their field. */
export function fitRules(rules: ViewRules, fields: TableField[]): ViewRules {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const sort = rules.sort.filter((s) => byId.has(s.field))
  const filters = rules.filters.filter((r) => fits(byId.get(r.field), r))
  return sort.length === rules.sort.length && filters.length === rules.filters.length ? rules : { ...rules, sort, filters }
}

const storageKey = (tableId: string) => `onecamp:tableView:${tableId}`

const FILTER_OPS = new Set<string>(Object.values(OPS_FOR).flatMap((ops) => ops.map((o) => o.op)))

/** The rules this reader keeps for a table, without any for fields deleted since. Never throws. */
export function loadViewRules(tableId: string, fields: TableField[]): ViewRules {
  if (typeof window === "undefined") return NO_RULES
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(tableId)) || "null") as Partial<ViewRules> | null
    if (!saved) return NO_RULES
    return fitRules(
      {
        sort: (saved.sort || []).filter((s) => s.dir === "asc" || s.dir === "desc"),
        filters: (saved.filters || []).filter((f) => FILTER_OPS.has(f.op)),
        match: saved.match === "any" ? "any" : "all",
      },
      fields,
    )
  } catch {
    return NO_RULES
  }
}

/** Keeps a table's rules for this reader; best-effort. */
export function saveViewRules(tableId: string, rules: ViewRules): void {
  try {
    if (rules.sort.length === 0 && rules.filters.length === 0) window.localStorage.removeItem(storageKey(tableId))
    else window.localStorage.setItem(storageKey(tableId), JSON.stringify(rules))
  } catch {
    // private mode or full storage: the rules last until the page closes
  }
}
