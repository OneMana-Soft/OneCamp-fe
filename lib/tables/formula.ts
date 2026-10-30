// Formula fields in tables: how a value the server worked out shows in a cell,
// a card and a phone's list. The functions the editor lists are its own
// (formulaCatalogue.ts, in the editor's chunk).

import { computedOf, isComputed, isMoreRef, type FormulaResult, type TableField } from "@/services/tableService"
import { fullDate, fullDateTime, shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import { agoInDays, durationText } from "@/lib/fieldTypes/kindsMore"
import { formatNumber, numberFormatOf, type NumberFormat } from "./cellFormat"

/** A number in a formula's or a rollup's format: a duration, or a number field's (B2); its cell and its footer alike. */
export function numberIn(n: number, fmt: NumberFormat): string {
  if (fmt.duration) return durationText(n, fmt.duration)
  const x = formatNumber(n, fmt)!
  return x.prefix + x.text + x.suffix
}

// A date in its style (B2).
const dated = (d: Date, s: string, style: NumberFormat["date"], long: boolean, day: boolean) =>
  style === "iso" ? s : style === "relative" ? agoInDays(d) : (long ? (day ? fullDate : fullDateTime) : day ? shortDate : shortDateTime)(d)

/** What a formula's cell shows. */
export type FormulaShown =
  | { kind: "blank" }
  | { kind: "error"; message: string }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "number" | "date" | "text"; text: string }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A value the server worked out, as its cell shows it: a number in the
 * reader's own format, a date in words, a checkbox ticked or not, and an
 * error by what went wrong.
 */
export function showFormulaValue(value: unknown, result: FormulaResult, fmt: NumberFormat = {}): FormulaShown {
  if (value === null || value === undefined || value === "") return { kind: "blank" }
  if (typeof value === "object") {
    const error = (value as { error?: unknown }).error
    return { kind: "error", message: typeof error === "string" ? error : "This can't be worked out" }
  }
  if (typeof value === "boolean") return { kind: "checkbox", checked: value }
  if (typeof value === "number") {
    return { kind: "number", text: numberIn(value, fmt) }
  }
  const s = String(value)
  if (result === "date") {
    const day = DAY.exec(s)
    if (day) {
      const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
      return { kind: "date", text: dated(d, s, fmt.date, fmt.date === "long", true) }
    }
    const t = new Date(s)
    if (!Number.isNaN(t.getTime())) {
      return { kind: "date", text: dated(t, s, fmt.date, fmt.date === "long", false) }
    }
  }
  return { kind: "text", text: s }
}

/** A formula's value as one line of text, for a board card: "" when blank. */
export function formulaText(value: unknown, result: FormulaResult, fmt?: NumberFormat): string {
  const shown = showFormulaValue(value, result, fmt)
  switch (shown.kind) {
    case "blank":
      return ""
    case "error":
      return "Error"
    case "checkbox":
      return shown.checked ? "Yes" : "No"
    default:
      return shown.text
  }
}

/** A card's title from its title field: a formula as its cell shows it, anything else as written. */
export function cardTitle(field: TableField, value: unknown): string {
  if (isComputed(field)) return formulaText(value, computedOf(field).result, numberFormatOf(field))
  if (Array.isArray(value)) {
    // A list's items, or the names of the rows and items a relation links to,
    // without its count of the links not shown.
    return value
      .filter((v) => !isMoreRef(v))
      .map((v) => (v && typeof v === "object" ? String((v as { label?: unknown }).label ?? "") : String(v)))
      .filter(Boolean)
      .join(", ")
  }
  return value === null || value === undefined ? "" : String(value)
}
