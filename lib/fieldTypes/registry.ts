// The web's field kinds (tables programme, PROGRAM.md §4.2 #60): one entry per
// kind, in the order the column menu offers them, in its groups. The type
// menus, the grid's cells and keys, the filters, the sorts and the summary bar
// all read a kind from here, never from a switch of their own; the server's
// kinds are the same (business/FieldTypes registry.go), held to one set of
// fixtures.

import {
  AlignLeft,
  ArrowUpRight,
  AtSign,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  CircleDot,
  CircleUser,
  Fingerprint,
  Hash,
  Link2,
  Network,
  Paperclip,
  Sigma,
  Star,
  Tag,
  Timer,
  Type,
  User,
  Users,
} from "@/lib/icons"
// Tables' own glyphs, not in lib/icons: every page brings that file, and these two only tables draw.
import { CircleDotDashed, Phone } from "lucide-react"
import { computedOf, type FieldType, type TableField } from "@/services/tableService"
import { parseTypedNumber } from "@/lib/format/number"
import type { SummaryFn } from "@/lib/tables/display"
import { durationFormat, durationText, isPhone, ratingMax } from "./kindsMore"
import { parseDurationSeconds } from "@/lib/format/durationSeconds"
import { formatLocale } from "@/lib/tables/numberFormat"
import { numberFormatOf } from "@/lib/tables/cellFormat"
import { numberIn } from "@/lib/tables/formula"
import type { FieldKind, FieldKindGroup, FilterKind, Parser } from "./types"

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

/** A phone number as it was written, when it is one (kindsMore isPhone, the server's rule). */
const asPhone: Parser = (text, field) => {
  const t = text.trim()
  if (!t || isPhone(t)) return { value: t }
  return { error: `"${field.name}" takes a phone number: "${t}" isn't one` }
}

/**
 * A duration in seconds, written as a clock (1:30), in units (1h 30m, 45m),
 * as hours and minutes (1h30), or as minutes alone in the reader's signs (90).
 */
const asDuration: Parser = (text, field, locale) => {
  const t = text.trim()
  if (!t) return { value: "" }
  const minutes = parseTypedNumber(t, locale)
  const seconds = parseDurationSeconds(t) ?? (typeof minutes === "number" ? minutes * 60 : null)
  if (seconds === null || seconds < 0) return { error: `"${field.name}" takes a duration, such as 90, 1:30 or 1h 30m: "${t}" isn't one` }
  return { value: seconds }
}

/** A rating: a whole number of stars from 1 to the field's most. */
const asRating: Parser = (text, field, locale) => {
  const t = text.trim()
  if (!t) return { value: "" }
  const n = parseTypedNumber(t, locale)
  const max = ratingMax(field)
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > max) return { error: `"${field.name}" is rated from 1 to ${max}: "${t}" isn't a rating` }
  return { value: n }
}

type KindIn = Omit<FieldKind, "stored" | "summaries" | "defaultSummary" | "group" | "offered"> &
  Partial<Pick<FieldKind, "summaries" | "defaultSummary" | "offered">>

/** A kind whose cells are its own: text, a number, a box, a day, options. */
function stored(group: FieldKindGroup, k: KindIn): FieldKind {
  return { summaries: () => ANY, defaultSummary: () => "none", offered: true, ...k, group, stored: true }
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
    group: "Advanced",
    offered: true,
    filter: (f) => (result(f) === "checkbox" ? "checkbox" : (result(f) as FilterKind)),
    summaries: (f) => (result(f) === "number" ? [...NUMERIC, ...ANY] : result(f) === "checkbox" ? [...TICKS, ...ANY] : ANY),
    defaultSummary: (f) => (result(f) === "number" ? "sum" : result(f) === "checkbox" ? "checked" : "none"),
    // A footer in the result's format, when it has one: "₹2,500", "13h 15m".
    numberText: (n, f) => {
      const fmt = numberFormatOf(f)
      return fmt.duration || fmt.currency || fmt.percent || fmt.decimals !== undefined ? numberIn(n, fmt) : formatLocale(n, { maximumFractionDigits: 2 })
    },
  }
}

/** What a row says of itself (its id, when it was made or changed, and by whom): read on every read, never written. */
function fromRow(k: Pick<FieldKind, "id" | "label" | "hint" | "glyph"> & { filter: FilterKind; summaries?: SummaryFn[]; defaultSummary?: SummaryFn }): FieldKind {
  return {
    ...k,
    stored: false,
    fromRow: true,
    options: false,
    cell: "computed",
    defaults: false,
    group: "About each row",
    offered: true,
    filter: () => k.filter,
    summaries: () => k.summaries ?? ANY,
    defaultSummary: () => k.defaultSummary ?? "none",
  }
}

/** When a row was made or last changed: the earliest and latest, or the count. */
const MOMENTS: SummaryFn[] = ["span", ...ANY]

const KINDS: FieldKind[] = [
  stored("Basic", { id: "text", label: "Text", hint: "Names, notes, anything", glyph: Type, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored("Basic", {
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
  stored("Basic", { id: "select", label: "Select", hint: "One option from a list", glyph: CircleDot, options: true, cell: "button", filter: () => "text", defaults: true }),
  stored("Basic", { id: "multi_select", label: "Multi-select", hint: "Several, as tags", glyph: Tag, options: true, cell: "button", filter: () => "list", defaults: false }),
  stored("Basic", {
    id: "status",
    label: "Status",
    hint: "To do, in progress, done",
    glyph: CircleDotDashed,
    options: true,
    cell: "button",
    filter: () => "text",
    summaries: () => ["groups", ...ANY],
    defaultSummary: () => "groups",
    defaults: true,
  }),
  stored("Basic", { id: "date", label: "Date", hint: "Due dates, calendars", glyph: CalendarDays, options: false, cell: "button", filter: () => "date", defaults: true }),
  stored("Basic", { id: "people", label: "People", hint: "Members of the workspace", glyph: Users, options: false, cell: "button", filter: () => "list", defaultSummary: () => "filled", defaults: false }),
  stored("Basic", {
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
  stored("Basic", { id: "url", label: "URL", hint: "A link that opens", glyph: Link2, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored("Basic", { id: "email", label: "Email", hint: "An address to write to", glyph: AtSign, options: false, cell: "text", filter: () => "text", parse: asTyped, defaults: true }),
  stored("Basic", { id: "phone", label: "Phone", hint: "A number to call", glyph: Phone, options: false, cell: "text", filter: () => "text", parse: asPhone, defaultSummary: () => "filled", defaults: true }),
  stored("Basic", { id: "long_text", label: "Long text", hint: "Notes over several lines", glyph: AlignLeft, options: false, cell: "text", filter: () => "text", parse: asTyped, defaultSummary: () => "filled", defaults: true }),
  // Its files filter by name, as a list (business/RowQuery fields.go).
  stored("Basic", { id: "attachment", label: "Files", hint: "Documents and pictures", glyph: Paperclip, options: false, cell: "button", filter: () => "list", defaults: false }),
  // A name written as text, before people were members (PROGRAM.md D-TB-4):
  // kept for the columns that have it; a new column is People.
  stored("Basic", { id: "person", label: "Person", hint: "A name, as text", glyph: User, options: false, cell: "text", filter: () => "list", parse: asTyped, defaults: true, offered: false }),
  stored("Advanced", { id: "relation", label: "Relation", hint: "Link to another table", glyph: ArrowUpRight, options: false, cell: "button", filter: () => "list", defaults: false }),
  computed({ id: "formula", label: "Formula", hint: "From other fields", glyph: Sigma }),
  computed({ id: "rollup", label: "Rollup", hint: "Add up what's linked", glyph: Network }),
  stored("Advanced", {
    id: "duration",
    label: "Duration",
    hint: "Hours and minutes",
    glyph: Timer,
    options: false,
    cell: "text",
    filter: () => "number",
    summaries: () => [...NUMERIC, ...ANY],
    defaultSummary: () => "sum",
    parse: asDuration,
    defaults: true,
    numberText: (n, f) => durationText(n, durationFormat(f)),
  }),
  stored("Advanced", {
    id: "rating",
    label: "Rating",
    hint: "Stars, out of five",
    glyph: Star,
    options: false,
    cell: "button",
    filter: () => "number",
    summaries: () => ["average", "median", "min", "max", ...ANY],
    defaultSummary: () => "average",
    parse: asRating,
    defaults: true,
    numberText: (n) => `${formatLocale(n, { maximumFractionDigits: 1 })} ★`,
  }),
  fromRow({ id: "autonumber", label: "ID", hint: "A number for each row", glyph: Fingerprint, filter: "number", defaultSummary: "count" }),
  fromRow({ id: "created_time", label: "Created time", hint: "When a row was made", glyph: CalendarClock, filter: "date", summaries: MOMENTS, defaultSummary: "span" }),
  fromRow({ id: "created_by", label: "Created by", hint: "Who made a row", glyph: CircleUser, filter: "list" }),
  fromRow({ id: "modified_time", label: "Last edited time", hint: "When a row last changed", glyph: CalendarClock, filter: "date", summaries: MOMENTS, defaultSummary: "span" }),
  fromRow({ id: "modified_by", label: "Last edited by", hint: "Who changed it last", glyph: CircleUser, filter: "list" }),
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
