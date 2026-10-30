// Sorting and filtering a table's rows: the rules a reader sets above the grid,
// board and calendar, kept in their browser for that table. The browser's own
// reading of them is lib/tables/applyRules, a chunk of its own.

import { isComputed, parseRowValues, type FieldType, type TableField, type TableRow } from "@/services/tableService"
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
/** Filters that pass as one: every one of them, or any one. */
export interface FilterGroup {
  match: "all" | "any"
  filters: FilterEntry[]
}
export type FilterEntry = FilterRule | FilterGroup
export type Granularity = "day" | "week" | "month" | "quarter" | "year"
/** A level of groups (QuerySpec Group): by a field, a date by its period. */
export type GroupRule = { field: string; dir: "asc" | "desc"; granularity?: Granularity }
export interface ViewRules {
  sort: SortRule[]
  filters: FilterEntry[]
  /** Whether a row must pass every filter, or any one. */
  match: "all" | "any"
  /** Up to three, leading the order; never empty, so views without compare alike. */
  groups?: GroupRule[]
}

export const NO_RULES: ViewRules = { sort: [], filters: [], match: "all" }
/** A view's filters, a group, a group in that: as deep as a spec goes (business/QuerySpec MaxFilterDepth). */
export const FILTER_DEPTH = 3
/** As many filters as a spec holds, every group's together (MaxConditions). */
export const MAX_FILTERS = 50
/** Whoever reads the view, as a people filter names them (QuerySpec Me). */
export const ME = "@me"
// The fields the server reads as people (business/RowQuery fields.go).
const PEOPLE = new Set<FieldType>(["people", "created_by", "modified_by"])
export const takesMe = (f: TableField) => PEOPLE.has(f.type)
export const isGroup = (e: FilterEntry): e is FilterGroup => "filters" in e
/** Whether a view groups by a field (RowQuery checkGroups): a choice, or what reads as a number, a date or a tick. */
export const groupsBy = (f: TableField) => f.type === "select" || f.type === "status" || ["number", "date", "checkbox"].includes(filterKind(f))
export const withGroups = (r: ViewRules, groups: GroupRule[]): ViewRules =>
  groups.length ? { ...r, groups } : { sort: r.sort, filters: r.filters, match: r.match }
/** A grouping's name: what a reader's collapsed groups are kept under. */
export const groupingOf = (gs: GroupRule[]) => gs.map((g) => g.field + (g.granularity ? `:${g.granularity}` : "")).join("|")
/** A group of one is that one entry, all or any alike, as the server reads it (lib/tables/query). */
export const loneEntry = (e: FilterEntry): FilterEntry => (isGroup(e) && e.filters.length === 1 ? loneEntry(e.filters[0]) : e)
/** Every filter in a list, every group's in it too. */
export const filterRules = (es: FilterEntry[]): FilterRule[] => es.flatMap((e) => (isGroup(e) ? filterRules(e.filters) : [e]))
export const filterCount = (es: FilterEntry[]): number => filterRules(es).length
/** Whether a filter, in any group, names whoever reads the view. */
export const namesMe = (es: FilterEntry[]): boolean => filterRules(es).some((r) => r.value === ME)
/** How deep a list goes: 1 with no group, 2 with a group, 3 with a group in a group. */
export const filterDepth = (es: FilterEntry[]): number => 1 + Math.max(0, ...es.map((e) => (isGroup(e) ? filterDepth(e.filters) : 0)))
/** "1 filter", "3 filters": a group's filters counted, every group in it too. */
export const filtersText = (es: FilterEntry[]): string => {
  const n = filterCount(es)
  return `${n} ${n === 1 ? "filter" : "filters"}`
}


const SORT_DIRECTIONS: Record<FilterKind, { asc: string; desc: string }> = {
  text: { asc: "A → Z", desc: "Z → A" },
  list: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "1 → 9", desc: "9 → 1" },
  date: { asc: "Oldest first", desc: "Newest first" },
  checkbox: { asc: "Unticked first", desc: "Ticked first" },
}

/** How a sort by a field reads each way (the Sort menu's, its groups', a rollup's), as text's when there's no field: a choice in its options' order, as the server sorts it. */
export const sortWords = (f?: TableField) =>
  f && (f.type === "select" || f.type === "status") ? { asc: "First → last", desc: "Last → first" } : SORT_DIRECTIONS[f ? filterKind(f) : "text"]

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

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const leap = (y: number) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
export const daysIn = (y: number, m: number) => (m === 2 ? (leap(y) ? 29 : 28) : m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31)

/** Whether text is a day Go's time.Parse("2006-01-02") reads: one that's on the calendar. */
export function isDay(s: string): boolean {
  const m = DAY.exec(s)
  if (!m) return false
  const mo = Number(m[2])
  return mo >= 1 && mo <= 12 && Number(m[3]) >= 1 && Number(m[3]) <= daysIn(Number(m[1]), mo)
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

/** A new filter on a field: its first condition, waiting for its value. */
export const freshFilter = (f: TableField): FilterRule => ({ field: f.id, op: OPS_FOR[filterKind(f)][0].op, value: "" })

/** Whether a filter still fits its field: the field is there, and takes that condition (a field's type can change). */
function fits(field: TableField | undefined, rule: FilterRule): boolean {
  return !!field && OPS_FOR[filterKind(field)].some((o) => o.op === rule.op)
}

// Filters without those that no longer fit, and groups left with none; the same list when all fit.
function fitFilters(es: FilterEntry[], byId: Map<string, TableField>): FilterEntry[] {
  const out = es.flatMap((e): FilterEntry[] => {
    if (!isGroup(e)) return fits(byId.get(e.field), e) ? [e] : []
    const filters = fitFilters(e.filters, byId)
    return filters.length === 0 ? [] : [filters === e.filters ? e : { ...e, filters }]
  })
  return out.length === es.length && out.every((e, i) => e === es[i]) ? es : out
}

/** A table's rules without any for fields that are gone, or filters that no longer fit their field. */
export function fitRules(rules: ViewRules, fields: TableField[]): ViewRules {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const sort = rules.sort.filter((s) => byId.has(s.field))
  const filters = fitFilters(rules.filters, byId)
  const was = rules.groups ?? []
  const groups = was.filter((g) => {
    const f = byId.get(g.field)
    return !!f && groupsBy(f) && (!g.granularity || filterKind(f) === "date")
  })
  return sort.length === rules.sort.length && filters === rules.filters && groups.length === was.length ? rules : withGroups({ ...rules, sort, filters }, groups)
}

/** A table's rules without those that read a formula or a rollup, which the server can refuse past what one read works out (airtable-03); null when none does. */
export function withoutComputed(rules: ViewRules, fields: TableField[]): ViewRules | null {
  const fitted = fitRules(rules, fields)
  const left = fitRules(fitted, fields.filter((f) => !isComputed(f)))
  return left === fitted ? null : left
}

const storageKey = (tableId: string) => `onecamp:tableView:${tableId}`

const FILTER_OPS = new Set<string>(Object.values(OPS_FOR).flatMap((ops) => ops.map((o) => o.op)))
const PERIODS = new Set<unknown>(["day", "week", "month", "quarter", "year"])

/** Rules as a reader's browser or a saved view (anyone's write) keeps them, made good; anything else is no rules. */
export function readViewRules(saved: unknown, fields: TableField[]): ViewRules {
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<ViewRules>
  let left = MAX_FILTERS
  // Groups past FILTER_DEPTH, and filters past MAX_FILTERS, are dropped.
  const read = (xs: unknown, depth: number): FilterEntry[] =>
    (Array.isArray(xs) ? xs : []).flatMap((x): FilterEntry[] => {
      if (!x || typeof x !== "object") return []
      if ("filters" in x) {
        const g = x as FilterGroup
        return depth < FILTER_DEPTH ? [{ match: g.match === "any" ? "any" : "all", filters: read(g.filters, depth + 1) }] : []
      }
      const f = x as FilterRule
      if (left === 0 || !FILTER_OPS.has(f.op) || (f.value !== undefined && typeof f.value !== "string")) return []
      left--
      return [f]
    })
  const groups = (Array.isArray(s.groups) ? s.groups : [])
    .filter((g) => g && typeof g.field === "string" && (g.dir === "asc" || g.dir === "desc"))
    .slice(0, 3)
    .map(({ field, dir, granularity }) => (PERIODS.has(granularity) ? { field, dir, granularity } : { field, dir }))
  return fitRules(
    withGroups(
      {
        sort: (Array.isArray(s.sort) ? s.sort : []).filter((x) => x && (x.dir === "asc" || x.dir === "desc")),
        filters: read(s.filters, 1),
        match: s.match === "any" ? "any" : "all",
      },
      groups,
    ),
    fields,
  )
}

/** The rules this reader keeps for a table, without any for fields deleted since. Never throws. */
export function loadViewRules(tableId: string, fields: TableField[]): ViewRules {
  if (typeof window === "undefined") return NO_RULES
  try {
    return readViewRules(JSON.parse(window.localStorage.getItem(storageKey(tableId)) || "null"), fields)
  } catch {
    return NO_RULES
  }
}

/** Keeps a table's rules for this reader; best-effort. */
export function saveViewRules(tableId: string, rules: ViewRules): void {
  try {
    if (rules.sort.length === 0 && rules.filters.length === 0 && !rules.groups) window.localStorage.removeItem(storageKey(tableId))
    else window.localStorage.setItem(storageKey(tableId), JSON.stringify(rules))
  } catch {
    // private mode or full storage: the rules last until the page closes
  }
}
