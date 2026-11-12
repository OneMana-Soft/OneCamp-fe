// Formula fields in tables: how a value the server worked out shows in a cell,
// a card and a phone's list. The functions the editor lists are its own
// (formulaCatalogue.ts, in the editor's chunk).

import { computedOf, isComputed, isMoreRef, type FormulaResult, type TableField } from "@/services/tableService"
import { fullDate, fullDateTime, shortDate, shortDateTime } from "@/lib/utils/date/shortDate"
import { agoInDays, durationText } from "@/lib/fieldTypes/kindsMore"
import { formatNumber, numberFormatOf, type NumberFormat } from "./cellFormat"
import { formulaLine, showFormulaValue as show, type FormulaShown, type FormulaWriter } from "./formulaValue"

/** A number in a formula's or a rollup's format: a duration, or a number field's (B2); its cell and its footer alike. */
export function numberIn(n: number, fmt: NumberFormat): string {
  if (fmt.duration) return durationText(n, fmt.duration)
  const x = formatNumber(n, fmt)!
  return x.prefix + x.text + x.suffix
}

// A date in its style (B2).
const dated = (d: Date, s: string, style: NumberFormat["date"], long: boolean, day: boolean) =>
  style === "iso" ? s : style === "relative" ? agoInDays(d) : (long ? (day ? fullDate : fullDateTime) : day ? shortDate : shortDateTime)(d)

export const tableWriter = (fmt: NumberFormat = {}): FormulaWriter => ({
  number: (n) => numberIn(n, fmt),
  date: (d, s, day) => dated(d, s, fmt.date, fmt.date === "long", day),
})

export const showFormulaValue = (value: unknown, result: FormulaResult, fmt: NumberFormat = {}): FormulaShown => show(value, result, tableWriter(fmt))

export const formulaText = (value: unknown, result: FormulaResult, fmt?: NumberFormat): string => formulaLine(showFormulaValue(value, result, fmt))

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
