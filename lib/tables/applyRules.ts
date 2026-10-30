// A view's rules (lib/tables/viewRules) applied in the browser, to the rows a
// page holds: a chunk of its own (components/table/lazyParts RulesPart), since
// the grid of an indexed table reads the server's windows, which come ruled.
// Pure, so the views and their tests share one reading of a cell.

import { compareKeys, naturalKey } from "@/lib/tables/sortKey"
import { isHiddenRef, isMoreRef, optionsOf, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { typedNumber } from "@/lib/format/number"
import { filterKind } from "@/lib/fieldTypes/registry"
import type { FilterKind } from "@/lib/fieldTypes/types"
import { goLower, goTrim } from "@/lib/utils/goText"
import { localDay } from "@/lib/utils/timeZone"
import { daysIn, filterRules, fitRules, isDay, isGroup, ME, NO_RULES, OPS_FOR, readViewRules, takesMe, type FilterEntry, type FilterGroup, type FilterOp, type FilterRule, type GroupRule, type ViewRules } from "@/lib/tables/viewRules"
import { isCampHue, type CampHue } from "@/lib/campHue"
import { shownValues, type RowEdits } from "@/lib/tables/useCellCommit"
import { optionHue, statusGroupOf } from "@/lib/fieldTypes/kindsMore"
import type { QuerySummaries } from "@/lib/querySpec/types"

/**
 * How a field's cells are read by a filter or a sort: as the server's
 * families read them (business/RowQuery fields.go and eval.go), so a table
 * means the same on either side of the rows the browser sorts itself. A
 * formula or a rollup is read here alone, by what it gives.
 */
type Reading = "text" | "choice" | "number" | "date" | "checkbox" | "list" | "worked"

interface Col {
  id: string
  /** The conditions it takes (OPS_FOR). */
  kind: FilterKind
  reading: Reading
  /** A row's stamp, read from the row itself: to the nanosecond, where its cell shows the second. */
  stamp?: "created_at" | "updated_at"
  /** A choice's options, lower case and trimmed, in their order: an option's place is its index and one. */
  places?: string[]
  /** Their labels as the field names them: a choice's group. */
  named?: string[]
  people?: boolean
}

function readingOf(f: TableField): Reading {
  switch (f.type) {
    case "select":
    case "status":
      return "choice"
    case "number":
    case "duration":
    case "rating":
    case "autonumber":
      return "number"
    case "date":
    case "created_time":
    case "modified_time":
      return "date"
    case "checkbox":
      return "checkbox"
    case "multi_select":
    case "attachment":
    case "people":
    case "relation":
    case "created_by":
    case "modified_by":
    case "person":
      return "list"
    case "formula":
    case "rollup":
      return "worked"
  }
  return "text" // text, long text, a link, an email, a phone, and a kind this web doesn't know
}

function colOf(f: TableField): Col {
  const kind = filterKind(f)
  const reading = readingOf(f)
  const col: Col = { id: f.id, kind, reading }
  if (f.type === "created_time") col.stamp = "created_at"
  if (f.type === "modified_time") col.stamp = "updated_at"
  if (reading === "choice") {
    col.named = optionsOf(f).map((o) => o.label)
    col.places = col.named.map((l) => goLower(goTrim(l)))
  }
  col.people = takesMe(f)
  // A formula or a rollup reads as what it gives; its text by its labels.
  if (reading === "worked" && kind !== "text") col.reading = kind === "list" ? "list" : kind
  return col
}

/** Each field's reading, worked out once a field. */
function columns(fields: TableField[]): (id: string) => Col {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const cols = new Map<string, Col>()
  return (id) => {
    let c = cols.get(id)
    if (!c) cols.set(id, (c = colOf(byId.get(id) as TableField)))
    return c
  }
}

/** A cell as a filter or a sort reads it: a row's stamp from the row. */
const cellOf = (col: Col, row: TableRow, values: Record<string, unknown>): unknown => (col.stamp ? row[col.stamp] : values[col.id])

/** A cell's labels: a list's items, a link's or a person's name, or the value; never one of only spaces. A formula's error has none, nor a count of links not shown. */
function labels(v: unknown): string[] {
  if (v === null || v === undefined || v === "" || isMoreRef(v)) return []
  if (Array.isArray(v)) return v.flatMap(labels)
  if (typeof v === "object") {
    const o = v as { label?: unknown; name?: unknown }
    const label = typeof o.label === "string" ? o.label : typeof o.name === "string" ? o.name : ""
    return goTrim(label) ? [label] : []
  }
  const s = String(v)
  return goTrim(s) ? [s] : []
}

/** A number as Go writes it in full (strconv.FormatFloat 'f', -1): its shortest digits, never an exponent. */
function fullNumber(n: number): string {
  const s = String(n)
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s)
  if (!m) return s
  const digits = m[2] + (m[3] ?? "")
  const e = Number(m[4])
  return e >= 0 ? m[1] + digits.padEnd(e + 1, "0") : `${m[1]}0.${"0".repeat(-e - 1)}${digits}`
}

/** A text cell as the server's textOf writes it: a string as it is, a number in full, a tick as true or false, anything else as JSON. */
function textOf(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "string") return v
  if (typeof v === "number") return fullNumber(v)
  if (typeof v === "boolean") return String(v)
  return JSON.stringify(v)
}

/** A choice's label: only text is one, and only when it isn't all spaces. */
const choiceOf = (v: unknown): string | null => (typeof v === "string" && goTrim(v) !== "" ? v : null)

/** A number cell's number: only a number is one (the server reads "1,200" as no number). */
const numberOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/**
 * A date as a sort and a filter read it: its instant, to the nanosecond (a
 * day at its midnight in UTC), and a day's own date, which a filter compares
 * where the reader is. Null for what the server doesn't read as a date: a
 * day that isn't one ("2026-02-30"), or a time without its offset.
 */
interface When {
  ms: number
  ns: number
  day: string | null
}

// RFC 3339, as Go's time.Parse reads it: a fraction after a point or a comma, then Z or the offset.
const MOMENT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:\d{2})$/

/** Milliseconds at a UTC date and time, for any year from 0 (Date.UTC reads 0 to 99 as 1900 to 1999). */
function utcMs(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  if (y >= 100) return Date.UTC(y, mo - 1, d, h, mi, s)
  const t = new Date(0)
  t.setUTCFullYear(y, mo - 1, d)
  t.setUTCHours(h, mi, s, 0)
  return t.getTime()
}

function whenOf(v: unknown): When | null {
  if (typeof v !== "string") return null
  if (v.length === 10) return isDay(v) ? { ms: utcMs(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10))), ns: 0, day: v } : null
  const m = MOMENT.exec(v)
  if (!m) return null
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number)
  if (mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo) || h > 23 || mi > 59 || s > 59) return null
  let offset = 0
  if (m[8] !== "Z") {
    const oh = Number(m[8].slice(1, 3))
    const om = Number(m[8].slice(4, 6))
    if (oh > 23 || om > 59) return null
    offset = (m[8][0] === "-" ? -1 : 1) * (oh * 60 + om)
  }
  // Go keeps nine digits of a second, and drops the rest.
  const frac = (m[7] ?? "").slice(0, 9).padEnd(9, "0")
  return { ms: utcMs(y, mo, d, h, mi, s) - offset * 60_000 + Number(frac.slice(0, 3)), ns: Number(frac.slice(3)), day: null }
}

/** The day a date falls on where the reader is: a day's own, a moment's in the reader's zone (the zone a query sends the server, lib/utils/timeZone). */
const dayOf = (w: When): string => w.day ?? localDay(new Date(w.ms))

/** Whether a cell has nothing to sort by: it's blank, or it's a link cell naming none of its links. */
function unnamed(col: Col, v: unknown): boolean {
  switch (col.reading) {
    case "checkbox":
      return false
    case "number":
      return numberOf(v) === null
    case "date":
      return whenOf(v) === null
    case "text":
      return goTrim(textOf(v)) === ""
    case "choice":
      return choiceOf(v) === null
  }
  return labels(v).length === 0
}

/** Whether a cell is empty: a link cell counting links it doesn't name, or holding ones the reader can't open, has links. */
const isBlank = (col: Col, v: unknown) => unnamed(col, v) && !(Array.isArray(v) && v.some((x) => isMoreRef(x) || isHiddenRef(x)))

/** A text-like cell's labels as a filter compares them: trimmed and lower-cased as Go does it. */
function compared(col: Col, v: unknown): string[] {
  if (col.reading === "text") return unnamed(col, v) ? [] : [goLower(goTrim(textOf(v)))]
  if (col.reading === "choice") {
    const c = choiceOf(v)
    return c === null ? [] : [goLower(goTrim(c))]
  }
  return labels(v).map((l) => goLower(goTrim(l)))
}

// The people a cell names, by id in lower case, as the server reads them (RowQuery idsOf).
const idsIn = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.flatMap(idsIn)
  const id = v && typeof v === "object" ? (v as { id?: unknown }).id : v
  return typeof id === "string" && id ? [goLower(id)] : []
}

function passes(col: Col, v: unknown, rule: FilterRule, me: string | null): boolean {
  switch (rule.op) {
    case "empty":
      return isBlank(col, v)
    case "not_empty":
      return !isBlank(col, v)
    case "checked":
      return v === true
    case "unchecked":
      return v !== true
  }
  if (col.people && rule.value === ME) return idsIn(v).includes(goLower(me ?? "")) === (rule.op === "contains")
  const want = goTrim(rule.value ?? "")
  if (want === "") return true // a filter not filled in yet hides nothing
  if (col.kind === "number") {
    // What the reader typed, read in their locale: "1,5" is 1.5 in de-DE,
    // never 15 (TAB-BUG-8 in the filter box).
    const w = typedNumber(want)
    if (w === null) return true
    const n = numberOf(v)
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
  if (col.kind === "date") {
    if (!isDay(want)) return true // not a day: it hides nothing, as the server isn't asked it
    const w = whenOf(v)
    if (w === null) return false
    const d = dayOf(w)
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
  const have = compared(col, v)
  const w = goLower(want)
  switch (rule.op) {
    case "contains":
      return col.kind === "list" ? have.includes(w) : have.join(", ").includes(w)
    case "not_contains":
      return col.kind === "list" ? !have.includes(w) : !have.join(", ").includes(w)
    case "is":
      return have.join(", ") === w
    case "is_not":
      return have.join(", ") !== w
  }
  return true
}

/**
 * Whether a row passes filters, all or any; a group with none in it hides
 * nothing, as the server's spec leaves it out. A colour rule's filters (of)
 * may compare with another field of the row.
 */
function passesAll(es: FilterEntry[], match: FilterGroup["match"], col: (id: string) => Col, row: TableRow, values: Record<string, unknown>, me: string | null, of = false): boolean {
  const one = (e: FilterEntry): boolean => {
    if (isGroup(e)) return passesAll(e.filters, e.match, col, row, values, me, of)
    const c = col(e.field)
    const to = of && COMPARES.has(e.op) ? (e as ColourFilter).of : undefined
    return to ? against(c, cellOf(c, row, values), e.op, cellOf(col(to), row, values)) : passes(c, cellOf(c, row, values), e, me)
  }
  return es.length === 0 || (match === "any" ? es.some(one) : es.every(one))
}

/** A filter against another cell of the same row, read alike: numbers by value, dates by their day. A blank on either side never passes. */
function against(col: Col, v: unknown, op: FilterOp, w: unknown): boolean {
  let s: number
  if (col.kind === "number") {
    const a = numberOf(v)
    const b = numberOf(w)
    if (a === null || b === null) return false
    s = a - b
  } else {
    const a = whenOf(v)
    const b = whenOf(w)
    if (!a || !b) return false
    const x = dayOf(a)
    const y = dayOf(b)
    s = x < y ? -1 : x > y ? 1 : 0
  }
  switch (op) {
    case "is":
      return s === 0
    case "is_not":
      return s !== 0
    case "gt":
    case "after":
      return s > 0
    case "lt":
    case "before":
      return s < 0
    case "gte":
      return s >= 0
    case "lte":
      return s <= 0
  }
  return false
}

/** A cell's sort key, or null when it has nothing to sort by (it goes last either way). */
type SortKey = string | number | [number, number] | [number, string] | [number, string, string]

function sortKeyOf(col: Col, v: unknown): SortKey | null {
  if (unnamed(col, v)) return null
  switch (col.reading) {
    case "number":
      return numberOf(v)
    case "date": {
      const w = whenOf(v) as When
      return [w.ms, w.ns]
    }
    case "checkbox":
      return Number(v === true)
    case "text":
      return naturalKey(textOf(v))
    case "choice": {
      // Its option's place (a label no option has after them all), then its label's key.
      const label = choiceOf(v) as string
      const at = (col.places as string[]).indexOf(goLower(goTrim(label)))
      return [at < 0 ? (col.places as string[]).length + 1 : at + 1, naturalKey(label)]
    }
  }
  return naturalKey(labels(v).join(", "))
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  if (typeof a === "number") return a - (b as number)
  if (typeof a === "string") return compareKeys(a, b as string)
  const [a0, a1, a2] = a
  const [b0, b1, b2] = b as [number, string | number, string?]
  if (a0 !== b0) return a0 - b0
  const c = typeof a1 === "number" ? a1 - (b1 as number) : compareKeys(a1, b1 as string)
  // A choice's text, byte for byte, as the server's COLLATE "C": labels no option has that sort alike stay apart.
  return c || (a2 === undefined || b2 === undefined || a2 === b2 ? 0 : a2 < b2 ? -1 : 1)
}

/** The first day of the period a day is in, as Postgres's date_trunc finds it: a week from its Monday. */
function periodOf(day: string, g: GroupRule["granularity"]): string {
  const [y, m, d] = day.split("-").map(Number)
  const at = new Date(utcMs(y, m, d))
  if (g === "week") at.setUTCDate(d - ((at.getUTCDay() + 6) % 7))
  else if (g === "month") at.setUTCDate(1)
  else if (g === "quarter") at.setUTCMonth(m - 1 - ((m - 1) % 3), 1)
  else if (g === "year") at.setUTCMonth(0, 1)
  return at.toISOString().slice(0, 10)
}

/**
 * A row's key at a group level (business/RowQuery groups.go keyOf): a choice
 * by its option's label as the field names it (a label no option has, by its
 * text in lower case), a tick by whether it is one, a number in full and a
 * date by the first day of its period where the reader is; "" for none.
 */
function groupKeyOf(col: Col, v: unknown, g: GroupRule): string {
  switch (col.reading) {
    case "checkbox":
      return String(v === true)
    case "choice": {
      const c = choiceOf(v)
      if (c === null) return ""
      const low = goLower(goTrim(c))
      const at = (col.places as string[]).indexOf(low)
      return at < 0 ? low : (col.named as string[])[at]
    }
    case "number": {
      const n = numberOf(v)
      return n === null ? "" : fullNumber(n)
    }
  }
  const w = whenOf(v)
  return w === null ? "" : periodOf(dayOf(w), g.granularity)
}

/** A group level's order (groups.go groupOrder): a choice by its option's place, its label's key, then its text; a date by its period; else as its sort. */
function groupOrderOf(col: Col, v: unknown, g: GroupRule): SortKey | null {
  if (col.reading === "choice") {
    const key = sortKeyOf(col, v) as [number, string] | null
    return key && [key[0], key[1], goLower(goTrim(choiceOf(v) as string))]
  }
  if (col.reading !== "date") return sortKeyOf(col, v)
  const key = groupKeyOf(col, v, g)
  return key ? utcMs(Number(key.slice(0, 4)), Number(key.slice(5, 7)), Number(key.slice(8, 10))) : null
}

/**
 * The rows the rules show, in the order they say. Filters and sorts on a
 * field that's gone are ignored; blanks sort last either way; rows that tie
 * keep their order. With no rules, the rows come back as they were given.
 */
export function applyViewRules(rows: TableRow[], fields: TableField[], rules: ViewRules, me: string | null = null): TableRow[] {
  const { filters, sort, groups = [] } = fitRules(rules, fields)
  // Groups lead the order, then the sorts.
  const sorts: { field: string; dir: "asc" | "desc"; group?: GroupRule }[] = [...groups.map((g) => ({ ...g, group: g })), ...sort]
  if (filters.length === 0 && sorts.length === 0) return rows
  const col = columns(fields)
  let out = rows.map((row) => ({ row, values: parseRowValues(row) }))
  if (filters.length > 0) out = out.filter(({ row, values }) => passesAll(filters, rules.match, col, row, values, me))
  if (sorts.length > 0) {
    // Each row's keys are worked out once, not once a comparison.
    const sortCols = sorts.map((s) => col(s.field))
    const keyed = out.map((x, i) => ({
      ...x,
      i,
      keys: sortCols.map((c, k) => {
        const g = sorts[k].group
        return g ? groupOrderOf(c, cellOf(c, x.row, x.values), g) : sortKeyOf(c, cellOf(c, x.row, x.values))
      }),
    }))
    out = keyed.sort((x, y) => {
      for (let k = 0; k < sorts.length; k++) {
        const a = x.keys[k]
        const b = y.keys[k]
        if ((a === null) !== (b === null)) return a === null ? 1 : -1
        if (a === null || b === null) continue
        const c = compareSortKeys(a, b)
        if (c !== 0) return sorts[k].dir === "asc" ? c : -c
      }
      return x.i - y.i
    })
  }
  return out.map((x) => x.row)
}

/** The most groups a view's rows fall into that are counted, as the server's (QuerySpec MaxGroupCounts), and what's said past them. */
export const MAX_GROUP_COUNTS = 1000
export const TOO_MANY_GROUPS = "Grouped this way, the rows fall into more than 1,000 groups: group by a field with fewer values, or a date by a longer period."

/** One group of rows the browser holds, as the server counts one (GroupCount), with where its rows start. */
export interface HeldGroup {
  key: string[]
  count: number
  from: number
}

/**
 * The groups of a view's rows, in the view's order (applyViewRules), as the
 * server counts them (groups.go foldGroups): every level's, depth first, each
 * with its keys down to its level, how many rows it holds and the first of
 * them; null past MAX_GROUP_COUNTS, which the server refuses to count. Pure.
 */
export function groupRows(rows: TableRow[], fields: TableField[], groups: GroupRule[]): HeldGroup[] | null {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const levels = fitRules({ ...NO_RULES, groups }, fields).groups ?? []
  const cols = levels.map((g) => colOf(byId.get(g.field) as TableField))
  const out: HeldGroup[] = []
  let open: HeldGroup[] = []
  let prev: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const values = parseRowValues(rows[i])
    const path = levels.map((g, l) => groupKeyOf(cols[l], cellOf(cols[l], rows[i], values), g))
    let d = 0
    while (i > 0 && d < path.length && path[d] === prev[d]) d++
    open = open.slice(0, d)
    for (let l = d; l < path.length; l++) {
      if (out.length === MAX_GROUP_COUNTS) return null
      const g = { key: path.slice(0, l + 1), count: 0, from: i }
      out.push(g)
      open.push(g)
    }
    for (const g of open) g.count++
    prev = path
  }
  return out
}

/**
 * Why a row kept at a view's end, where it was added (tables T5c: the view's
 * rows come ruled from the server, and a row added here is held last), isn't
 * where the view's rules would put it: the filter hides it, or a sort puts it
 * elsewhere. Null when it is where it belongs: it passes the filters and
 * every key it sorts by is blank, and blanks sort last. applyViewRules'
 * meaning, for one row. Pure.
 */
export function keptReason(row: TableRow, fields: TableField[], rules: ViewRules, me: string | null = null): "filter" | "sort" | null {
  if (applyViewRules([row], fields, { ...rules, sort: [] }, me).length === 0) return "filter"
  const byId = new Map(fields.map((f) => [f.id, f]))
  const values = parseRowValues(row)
  const sorted = [...(rules.groups ?? []), ...rules.sort].some((s) => {
    const f = byId.get(s.field)
    if (!f) return false
    const c = colOf(f)
    return sortKeyOf(c, cellOf(c, row, values)) !== null
  })
  return sorted ? "sort" : null
}


/** A rule of a view's colours (tables V3): the rows its filters pass take its hue, the first rule's they pass; with a cell, only that field's cell does. */
export interface ColorRule {
  hue: CampHue
  match: "all" | "any"
  filters: FilterEntry[]
  /** The field whose cell it colours, not the row. */
  cell?: string
}
/** A number field's colour scale: its cells shade from light to strong, its lowest to its highest. */
export interface ColorScale {
  field: string
  hue: CampHue
}
/** How a view colours its rows: by a choice field's option hues, or by rules; and its numbers by scales. Kept in its display, saved with it. */
export type RowColors = ({ field: string } | { rules: ColorRule[] }) & { scales?: ColorScale[] }
export const MAX_COLOR_RULES = 10
export const MAX_COLOR_SCALES = 5

/**
 * A colour rule's filter may compare with another field of the same row
 * (of) where it'd take a value: "Amount > Budget", or a rollup of a
 * vendor's invoices over its budget. Colour rules only: a view's filters
 * go to the server too, which reads values.
 */
export type ColourFilter = FilterRule & { of?: string }
const COMPARES = new Set<FilterOp>(["is", "is_not", "gt", "lt", "gte", "lte", "before", "after"])

/** The fields a filter on f can compare with: the others that read as a number, or a date, as f does. */
export function comparesWith(f: TableField, fields: TableField[]): TableField[] {
  const k = filterKind(f)
  return k === "number" || k === "date" ? fields.filter((x) => x.id !== f.id && filterKind(x) === k) : []
}

// A rule's comparisons, kept while the other field is there and reads alike, and the condition compares.
function fitOf(es: FilterEntry[], fields: TableField[]): FilterEntry[] {
  return es.map((e) => {
    if (isGroup(e)) return { ...e, filters: fitOf(e.filters, fields) }
    const { of, ...rule } = e as ColourFilter
    if (of === undefined) return e
    const f = fields.find((x) => x.id === rule.field)
    return f && COMPARES.has(rule.op) && comparesWith(f, fields).some((x) => x.id === of) ? e : rule
  })
}

function readScales(xs: unknown, byId: Map<string, TableField>): ColorScale[] {
  const out: ColorScale[] = []
  for (const s of Array.isArray(xs) ? (xs as (Partial<ColorScale> | null)[]) : []) {
    if (!s || typeof s.field !== "string" || !isCampHue(s.hue)) continue
    const f = byId.get(s.field)
    if (f && filterKind(f) === "number" && !out.some((x) => x.field === f.id) && out.length < MAX_COLOR_SCALES) out.push({ field: f.id, hue: s.hue })
  }
  return out
}

/** A view's colours as a browser or a saved view keeps them, made good against the fields; null for none. */
export function readColors(kept: unknown, fields: TableField[]): RowColors | null {
  const o = (kept && typeof kept === "object" ? kept : {}) as { field?: unknown; rules?: unknown; scales?: unknown }
  const byId = new Map(fields.map((f) => [f.id, f]))
  const scales = readScales(o.scales, byId)
  const more = scales.length ? { scales } : {}
  if (typeof o.field === "string") {
    const f = byId.get(o.field)
    return f && (f.type === "select" || f.type === "status") ? { field: o.field, ...more } : scales.length ? { rules: [], scales } : null
  }
  const rules = (Array.isArray(o.rules) ? (o.rules as (Partial<ColorRule> | null)[]) : [])
    .flatMap((r): ColorRule[] => {
      // A rule for a cell whose field is gone colours nothing.
      if (!r || !isCampHue(r.hue) || (r.cell !== undefined && !byId.has(r.cell))) return []
      const { filters, match } = readViewRules({ filters: r.filters, match: r.match }, fields)
      return [{ hue: r.hue, match, filters: fitOf(filters, fields), ...(r.cell !== undefined && { cell: r.cell }) }]
    })
    .slice(0, MAX_COLOR_RULES)
  return rules.length || scales.length ? { rules, ...more } : null
}

/** Whether a filter says anything yet: its condition needs no value, or it has one, or it compares with another field. */
function said(col: (id: string) => Col, f: FilterRule): boolean {
  const op = OPS_FOR[col(f.field).kind].find((o) => o.op === f.op)
  return !!op && (!op.needsValue || goTrim(f.value ?? "") !== "" || !!(f as ColourFilter).of)
}

/** How one row's hue is read under a view's colours: null for none. */
function hueReader(colors: RowColors, fields: TableField[], me: string | null): (r: TableRow, values?: Record<string, unknown>) => CampHue | null {
  if ("field" in colors) {
    const f = fields.find((x) => x.id === colors.field) as TableField
    const status = f.type === "status"
    const hueOf = new Map(optionsOf(f).map((o) => [o.label, optionHue(o.color, status ? statusGroupOf(o) : undefined)]))
    return (r, values = parseRowValues(r)) => hueOf.get(String(values[f.id] ?? "")) ?? null
  }
  const col = columns(fields)
  const rules = colors.rules.filter((c) => !c.cell && filterRules(c.filters).some((f) => said(col, f)))
  return (r, values = parseRowValues(r)) => rules.find((c) => passesAll(c.filters, c.match, col, r, values, me, true))?.hue ?? null
}

// The hues worked out last, by row (CR-63, 27 Oct): a windowed table adds its
// rows a page at a time, so only a row not read before, or whose copy changed,
// is read again while the colours, the fields and the reader stay the same.
// Kept for a day: a rule on a relative date ("today") reads a row again the
// day after (CR-63's midnight note).
let lastHues: { kept: unknown; fields: TableField[]; me: string | null; day: string; of: WeakMap<TableRow, CampHue | null> } | null = null

/**
 * Each row's hue as a view colours them (data-row-hue): its option's colour
 * when the view colours by a choice, else the hue of the first row rule it
 * passes (a cell rule colours a cell, cellTints). Rows read before keep their
 * hue while the colours, the fields, the reader and the day stay (lastHues);
 * rows with no hue aren't in the map.
 */
export function rowHues(rows: TableRow[], fields: TableField[], kept: unknown, me: string | null, edits?: ReadonlyMap<string, RowEdits>): Map<string, CampHue> {
  const out = new Map<string, CampHue>()
  const colors = readColors(kept, fields)
  if (!colors) return out
  const day = localDay(new Date())
  if (!lastHues || lastHues.kept !== kept || lastHues.fields !== fields || lastHues.me !== me || lastHues.day !== day) lastHues = { kept, fields, me, day, of: new WeakMap() }
  const known = lastHues.of
  const read = hueReader(colors, fields, me)
  for (const r of rows) {
    // A row with edits its copy doesn't show yet is read as its cells show
    // it, so an edit colours it at once, not once its save lands (CR-63).
    const e = edits?.get(r.id)
    let hue = e ? read(r, shownValues(r, e)) : known.get(r)
    if (hue === undefined) known.set(r, (hue = read(r)))
    if (hue) out.set(r.id, hue)
  }
  return out
}

/** What a row's cells take from a view's colours before their scales' steps: its cell rules' hues, and its numbers on each scale. */
interface CellRead {
  hues: Record<string, CampHue>
  nums: (number | null)[]
}
// As lastHues: the rows read while the colours, the fields, the reader and
// the day stay; and each row's tints as last given, so a row whose tints
// are the same is handed the same record and the grid keeps its element.
// drawn is by row id, not a WeakMap by row (CR-67's note): a window read
// again hands new row objects for the same rows, and their tints must still
// be the records already drawn; it starts afresh with the colours.
let lastTints: { kept: unknown; fields: TableField[]; me: string | null; day: string; of: WeakMap<TableRow, CellRead>; drawn: Map<string, { key: string; tint: Record<string, string> }> } | null = null

/**
 * Each cell's tint as a view colours them, as the grid draws it (table.css
 * td[data-tint]): the hue of the first cell rule its row passes for its
 * field ("sky"), else its number's step on its field's scale ("moss-3"),
 * 1 to 4 from the field's lowest to its highest: of the whole view as the
 * server worked them out (served, for a view read in windows), else of the
 * rows held. Rows without a tint aren't in the map.
 */
export function cellTints(
  rows: TableRow[],
  fields: TableField[],
  kept: unknown,
  me: string | null,
  edits?: ReadonlyMap<string, RowEdits>,
  served?: QuerySummaries | null,
): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  const colors = readColors(kept, fields)
  if (!colors) return out
  const col = columns(fields)
  const rules = "rules" in colors ? colors.rules.filter((c) => c.cell && filterRules(c.filters).some((f) => said(col, f))) : []
  const scales = colors.scales ?? []
  if (!rules.length && !scales.length) return out
  const day = localDay(new Date())
  if (!lastTints || lastTints.kept !== kept || lastTints.fields !== fields || lastTints.me !== me || lastTints.day !== day) lastTints = { kept, fields, me, day, of: new WeakMap(), drawn: new Map() }
  const { of: known, drawn } = lastTints
  const read = (r: TableRow, values = parseRowValues(r)): CellRead => {
    const hues: Record<string, CampHue> = {}
    for (const c of rules) if (!((c.cell as string) in hues) && passesAll(c.filters, c.match, col, r, values, me, true)) hues[c.cell as string] = c.hue
    return { hues, nums: scales.map((sc) => numberOf(values[sc.field])) }
  }
  const reads = rows.map((r) => {
    // A row with edits its copy doesn't show yet is read as its cells show it (CR-63).
    const e = edits?.get(r.id)
    if (e) return read(r, shownValues(r, e))
    let x = known.get(r)
    if (!x) known.set(r, (x = read(r)))
    return x
  })
  const ranges = scales.map((sc, i) => {
    const w = served?.[`field:${sc.field}`]
    if (typeof w?.min === "number" && typeof w?.max === "number") return [w.min, w.max]
    let lo = Infinity
    let hi = -Infinity
    for (const x of reads) {
      const n = x.nums[i]
      if (n !== null && n < lo) lo = n
      if (n !== null && n > hi) hi = n
    }
    return [lo, hi]
  })
  rows.forEach((r, k) => {
    const x = reads[k]
    const tint: Record<string, string> = { ...x.hues }
    scales.forEach((sc, i) => {
      const n = x.nums[i]
      if (n === null || sc.field in tint) return
      const [lo, hi] = ranges[i]
      const t = hi > lo ? Math.min(1, Math.max(0, (n - lo) / (hi - lo))) : 0
      tint[sc.field] = `${sc.hue}-${1 + Math.min(3, Math.floor(t * 4))}`
    })
    const key = JSON.stringify(tint)
    if (key === "{}") return
    const was = drawn.get(r.id)
    if (was?.key === key) return out.set(r.id, was.tint)
    drawn.set(r.id, { key, tint })
    out.set(r.id, tint)
  })
  return out
}

/** A view's colours as the grid draws them: each row's hue (rowHues) and each cell's tint (cellTints). */
export function paint(rows: TableRow[], fields: TableField[], kept: unknown, me: string | null, edits?: ReadonlyMap<string, RowEdits>, served?: QuerySummaries | null) {
  return { hues: rowHues(rows, fields, kept, me, edits), tints: cellTints(rows, fields, kept, me, edits, served) }
}
