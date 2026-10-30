// B4's timeline and Gantt over a table's rows (airtable-05, notion-db-04):
// which fields give a row its days, which link says what it waits on, and the
// dates a drag writes back. Pure; the layouts' chunk reads it.

import { format, startOfDay } from "date-fns"
import { dayOf } from "@/lib/tables/cellFormat"
import { ZOOMS, type Zoom } from "@/lib/timeline"
import { isHiddenRef, isMoreRef, relationOf, type RelationRef, type TableField } from "@/services/tableService"

/** How a view draws its rows across their days, as its display keeps it (TableDisplay.timeline). */
export interface TimelineLook {
  /** The date field a bar starts on. */
  start: string | null
  /** The date field it ends on: none, and a bar is its start's one day. */
  end: string | null
  /** On a Gantt: the link to this table's own rows that says what a row waits on. */
  deps: string | null
  zoom: Zoom
}

/** The days a row covers, both ends included, as local midnights. */
export interface RowSpan {
  start: Date
  end: Date
}

const isZoom = (v: unknown): v is Zoom => ZOOMS.some((z) => z.value === v)

/** A table's date fields, in the order its columns are. */
export const dateFields = (fields: TableField[]) => fields.filter((f) => f.type === "date")

/** The links from this table to its own rows: what a Gantt's arrows can be drawn from. */
export const selfLinks = (fields: TableField[], tableId: string) =>
  fields.filter((f) => {
    if (f.type !== "relation") return false
    const r = relationOf(f)
    return r.target === "table" && r.tableId === tableId
  })

/**
 * A look as kept, made good against the table's fields: a field that's gone
 * or isn't a date is the table's first date field (the end its second, or
 * none); a link that isn't to this table's rows is its first that is.
 */
export function readTimelineLook(raw: unknown, fields: TableField[], tableId: string): TimelineLook {
  const kept = raw && typeof raw === "object" ? (raw as Partial<Record<keyof TimelineLook, unknown>>) : {}
  const dates = dateFields(fields)
  const isDate = (id: unknown): id is string => typeof id === "string" && dates.some((f) => f.id === id)
  const start = isDate(kept.start) ? kept.start : (dates[0]?.id ?? null)
  // An end kept as null is the reader's choice: one day bars.
  const end = kept.end === null && "end" in kept ? null : isDate(kept.end) && kept.end !== start ? kept.end : (dates.find((f) => f.id !== start)?.id ?? null)
  const links = selfLinks(fields, tableId)
  const deps = kept.deps === null && "deps" in kept ? null : typeof kept.deps === "string" && links.some((f) => f.id === kept.deps) ? kept.deps : (links[0]?.id ?? null)
  return { start, end, deps, zoom: isZoom(kept.zoom) ? kept.zoom : "week" }
}

/**
 * The days a row covers, or null when it has no start. A row with an end
 * before its start covers its end's one day, as a task does (lib/timeline
 * spanOf); one with no end, its start's.
 */
export function spanOfRow(values: Record<string, unknown>, look: TimelineLook): RowSpan | null {
  const start = look.start ? dayOf(values[look.start]) : undefined
  if (!start) return null
  const end = look.end ? dayOf(values[look.end]) : undefined
  const from = startOfDay(start)
  const to = end ? startOfDay(end) : from
  return to < from ? { start: to, end: to } : { start: from, end: to }
}

/** What a bar's new days write to its row: its start, and its end where the look has one. */
export function datesOf(span: RowSpan, look: TimelineLook): Record<string, string> {
  const out: Record<string, string> = {}
  if (look.start) out[look.start] = format(span.start, "yyyy-MM-dd")
  if (look.end) out[look.end] = format(span.end, "yyyy-MM-dd")
  return out
}

/** The rows a row waits on, by the look's link: ids of this table's rows the reader may see. */
export function waitsOn(values: Record<string, unknown>, look: TimelineLook): string[] {
  const v = look.deps ? values[look.deps] : undefined
  if (!Array.isArray(v)) return []
  return (v as RelationRef[]).filter((r) => r && typeof r.id === "string" && !isMoreRef(r) && !isHiddenRef(r)).map((r) => r.id)
}
