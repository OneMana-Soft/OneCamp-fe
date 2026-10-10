/** Custom fields on tasks: a project's own fields and each task's values.
 * The server keeps the values beside the task (business/TaskField) and lays
 * them over every task it lists, as task_fields, by field id. Pure. */

import { shortDate } from "@/lib/utils/date/shortDate"

export type FieldType = "text" | "number" | "money" | "date" | "select" | "multi_select" | "person" | "checkbox" | "url"

export interface FieldOption {
  id: string
  label: string
  color: string
}

export interface TaskField {
  id: string
  project_id: string
  name: string
  type: FieldType
  options: FieldOption[]
  /** A money field's three-letter currency. */
  currency?: string
  /** Shown on the task's board card. */
  on_card: boolean
  position: number
  /** The list filter id that narrows a list to this field's values. */
  filter_id: string
}

/** A value as stored: text, a link, a day ("2026-10-31") or a select's option
 * id and a person's id are strings; a number is a number; money is whole cents;
 * a multi-select is option ids; a ticked box is true. */
export type FieldValue = string | number | boolean | string[]

/** A task's values, by field id. */
export type FieldValues = Record<string, FieldValue>

export const FIELD_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "select", label: "Select", hint: "One of a few options" },
  { value: "multi_select", label: "Multi-select", hint: "Any of a few options" },
  { value: "text", label: "Text", hint: "A line of text" },
  { value: "number", label: "Number", hint: "A count or a score" },
  { value: "money", label: "Money", hint: "An amount in a currency" },
  { value: "date", label: "Date", hint: "A day" },
  { value: "person", label: "Person", hint: "Someone in the workspace" },
  { value: "checkbox", label: "Checkbox", hint: "Yes or no" },
  { value: "url", label: "Link", hint: "A web address" },
]

export const typeLabel = (t: FieldType) => FIELD_TYPES.find((f) => f.value === t)?.label ?? t

/** Field types a list can be filtered on: the ones with set values. */
export const FILTERABLE: FieldType[] = ["select", "multi_select", "person", "checkbox"]

/** How a person field names someone the project doesn't list. */
export const OUTSIDE_PROJECT = "Someone outside the project"

/** Filter values that ask for tasks with some value of a field, or none. */
export const FILTER_ANY = "any"
export const FILTER_NONE = "none"

export const optionOf = (field: Pick<TaskField, "options">, id: string) => field.options.find((o) => o.id === id)

/** A money amount in cents, written in its currency for the reader's locale. */
export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** A day ("2026-10-31") written for the reader, in no time zone: "31 Oct", or "31 Oct 2025" in another year. */
export function formatDay(day: string, now: Date = new Date()): string {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return day
  return shortDate(new Date(y, m - 1, d), now)
}

/** A value as text, as a list cell or a card shows it; "" when there's none.
 * nameOf names a person from their id. */
export function formatFieldValue(field: TaskField, value: FieldValue | undefined, nameOf?: (id: string) => string | undefined): string {
  if (value === undefined || value === null || value === "") return ""
  switch (field.type) {
    case "text":
      return String(value)
    case "url":
      try {
        const u = new URL(String(value))
        return u.host + (u.pathname === "/" ? "" : u.pathname)
      } catch {
        return String(value)
      }
    case "number":
      return typeof value === "number" ? value.toLocaleString() : String(value)
    case "money":
      return typeof value === "number" ? formatMoney(value, field.currency) : ""
    case "date":
      return formatDay(String(value))
    case "select":
      return optionOf(field, String(value))?.label ?? ""
    case "multi_select":
      return (Array.isArray(value) ? value : [])
        .map((id) => optionOf(field, id)?.label)
        .filter(Boolean)
        .join(", ")
    case "person":
      return nameOf?.(String(value)) ?? OUTSIDE_PROJECT
    case "checkbox":
      return value === true ? "Yes" : ""
  }
  return ""
}

/** The field id a list filter id names ("field_" and the id's 32 hex digits), or null. */
export function fieldIdOfFilter(filterId: string): string | null {
  const m = /^field_([0-9a-f]{32})$/.exec(filterId)
  if (!m) return null
  const h = m[1]
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Whether a task's value of a field matches a filter's values, as the
 * server decides it: one of the option ids, person ids or "true" asked for,
 * any value at all ("any"), or none ("none"). */
export function fieldFilterMatches(values: FieldValues | undefined, filterId: string, asked: string[]): boolean {
  const fieldId = fieldIdOfFilter(filterId)
  if (!fieldId || asked.length === 0) return true
  const v = values?.[fieldId]
  const has = v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)
  return asked.some((a) => {
    if (a === FILTER_ANY) return has
    if (a === FILTER_NONE) return !has
    if (!has) return false
    if (Array.isArray(v)) return v.includes(a)
    return String(v) === a
  })
}


/** What a typed value is for a text-like field (text, link, number, money):
 * null to take it off, or what to say. A link without its https:// gets it;
 * money is typed in units and kept in cents. */
export function parseFieldInput(field: Pick<TaskField, "name" | "type">, text: string): { value: FieldValue | null } | { error: string } {
  const t = text.trim()
  if (t === "") return { value: null }
  switch (field.type) {
    case "text":
      return { value: t }
    case "url": {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
      try {
        const u = new URL(withScheme)
        if ((u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".")) return { value: withScheme }
      } catch {
        // falls through to the message
      }
      return { error: `${field.name} takes a web address, like example.com/page.` }
    }
    case "number":
    case "money": {
      // A currency sign before the amount ("₹ 12,500") goes.
      const n = parseTypedNumber(t.replace(/^[^\p{L}\d.,-]+/u, ""))
      if (n === null) return { error: `${field.name} takes a number, like ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2 }).format(12500.5)}.` }
      return { value: field.type === "money" ? Math.round(n * 100) : n }
    }
  }
  return { error: `${field.name} isn't typed in.` }
}

/** A text-like value as its box shows it for editing: money in units. */
export function draftOf(field: Pick<TaskField, "type">, value: FieldValue | undefined): string {
  if (value === undefined || value === null) return ""
  if (field.type === "money" && typeof value === "number") return value % 100 === 0 ? String(value / 100) : (value / 100).toFixed(2)
  return String(value)
}

/** A task's values with one field's set (or taken off, null), as a copy. */
export function withField(values: FieldValues | undefined, fieldId: string, value: FieldValue | null): FieldValues {
  const next: FieldValues = { ...(values ?? {}) }
  if (value === null || (Array.isArray(value) && value.length === 0)) delete next[fieldId]
  else next[fieldId] = value
  return next
}

/** The reader's decimal and grouping marks, as their locale writes numbers. */
function marks(locale?: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  return { decimal: parts.find((p) => p.type === "decimal")?.value ?? ".", group: parts.find((p) => p.type === "group")?.value ?? "," }
}

const escapeRe = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A number as someone types it: in their own locale's marks (12.500,50 in
 * German, 12,500.50 in English), or the other way round when that is its only
 * reading (12.50 typed in German, 12,50 in English). Spaces and apostrophes
 * group digits. Null when it isn't a number: a comma read as a thousands mark
 * never turns 12,50 into 1250. */
export function parseTypedNumber(text: string, locale?: string): number | null {
  const t = text.replace(/[\s\u00a0\u202f']/g, "")
  if (!/^-?\d[\d.,]*$/.test(t)) return null
  const { decimal } = marks(locale)
  const read = (dec: string, grp: string): number | null => {
    const d = escapeRe(dec)
    const g = escapeRe(grp)
    const ok = new RegExp(`^-?\\d{1,3}(${g}\\d{3})+(${d}\\d+)?$`).test(t) || new RegExp(`^-?\\d+(${d}\\d+)?$`).test(t)
    if (!ok) return null
    const n = Number(t.split(grp).join("").replace(dec, "."))
    return Number.isFinite(n) ? n : null
  }
  return decimal === "," ? (read(",", ".") ?? read(".", ",")) : (read(".", ",") ?? read(",", "."))
}
