// The web's field kinds (tables programme, PROGRAM.md §4.2 #60): one entry per
// kind, in the order the column menu offers them. The type menus, the grid's
// cells and keys, the filters, the sorts and the summary bar all read a kind
// from here, never from a switch of their own; the server's twelve are the
// same (business/FieldTypes registry.go), held to one set of fixtures.

import { ArrowUpRight, AtSign, CalendarDays, CheckSquare, CircleDot, Hash, Link2, Network, Sigma, Tag, Type, User } from "@/lib/icons"
import { computedOf, type FieldType, type TableField } from "@/services/tableService"
import { parseTypedNumber } from "@/lib/format/number"
import type { SummaryFn } from "@/lib/tables/display"
import type { FieldKind, FilterKind, Parser } from "./types"

const NUMERIC: SummaryFn[] = ["sum", "average", "median", "min", "max", "range"]
const ANY: SummaryFn[] = ["count", "empty", "filled", "pct_empty", "pct_filled"]
const TICKS: SummaryFn[] = ["checked", "unchecked"]

/** Text as it was typed, line breaks and all. */
const asTyped: Parser = (text) => ({ value: text })

/** A number as the reader types it (TAB-BUG-8): their decimal and group signs; "" clears; anything else is refused. */
const asNumber: Parser = (text, field, locale) => {
  const n = parseTypedNumber(text, locale)
  if (n === null) return { error: `"${field.name}" takes a number: "${text.trim()}" isn't one` }
  return { value: n }
}

/** A kind whose cells are its own: text, a number, a box, a day, options. */
function stored(k: Omit<FieldKind, "stored" | "summaries" | "defaultSummary"> & Partial<Pick<FieldKind, "summaries" | "defaultSummary">>): FieldKind {
  return { summaries: () => ANY, defaultSummary: () => "none", ...k, stored: true }
}

/** A formula or a rollup, which reads as what it gives. */
function computed(k: Pick<FieldKind, "id" | "label" | "hint" | "glyph">): FieldKind {
  const result = (f: TableField) => computedOf(f).result
  return {
    ...k,
    stored: false,
    options: false,
    cell: "computed",
    defaults: false,
    filter: (f) => (result(f) === "checkbox" ? "checkbox" : (result(f) as FilterKind)),
    summaries: (f) => (result(f) === "number" ? [...NUMERIC, ...ANY] : result(f) === "checkbox" ? [...TICKS, ...ANY] : ANY),
    defaultSummary: (f) => (result(f) === "number" ? "sum" : result(f) === "checkbox" ? "checked" : "none"),
  }
}

const KINDS: FieldKind[] = [
  stored({ id: "text", label: "Text", hint: "Names, notes, anything", glyph: Type, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored({
    id: "number",
    label: "Number",
    hint: "Sums and currency",
    glyph: Hash,
    options: false,
    cell: "number",
    filter: () => "number",
    summaries: () => [...NUMERIC, ...ANY],
    defaultSummary: () => "sum",
    parse: asNumber,
    defaults: true,
  }),
  stored({ id: "select", label: "Select", hint: "One option from a list", glyph: CircleDot, options: true, cell: "button", filter: () => "text", defaults: true }),
  stored({ id: "multi_select", label: "Multi-select", hint: "Several, as tags", glyph: Tag, options: true, cell: "button", filter: () => "list", defaults: false }),
  stored({ id: "date", label: "Date", hint: "Due dates, calendars", glyph: CalendarDays, options: false, cell: "button", filter: () => "date", defaults: true }),
  stored({
    id: "checkbox",
    label: "Checkbox",
    hint: "Done or not",
    glyph: CheckSquare,
    options: false,
    cell: "checkbox",
    filter: () => "checkbox",
    summaries: () => [...TICKS, ...ANY],
    defaultSummary: () => "checked",
    defaults: true,
  }),
  stored({ id: "url", label: "URL", hint: "A link that opens", glyph: Link2, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored({ id: "email", label: "Email", hint: "An address to write to", glyph: AtSign, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored({ id: "person", label: "Person", hint: "Who it belongs to", glyph: User, options: false, cell: "text", filter: () => "list", parse: asTyped, defaults: true }),
  stored({ id: "relation", label: "Relation", hint: "Link to another table", glyph: ArrowUpRight, options: false, cell: "button", filter: () => "list", defaults: false }),
  computed({ id: "formula", label: "Formula", hint: "From other fields", glyph: Sigma }),
  computed({ id: "rollup", label: "Rollup", hint: "Add up what's linked", glyph: Network }),
]

const BY_ID = new Map<FieldType, FieldKind>(KINDS.map((k) => [k.id, k]))

/** Every kind, in the order the column menu offers them. */
export const FIELD_KINDS: readonly FieldKind[] = KINDS

/** A kind by its type; text for one this web doesn't know (a kind added on the server since). */
export function fieldKind(type: FieldType): FieldKind {
  return BY_ID.get(type) ?? (BY_ID.get("text") as FieldKind)
}

/** How a field's cells compare in a filter or a sort. */
export function filterKind(f: TableField): FilterKind {
  return fieldKind(f.type).filter(f)
}
