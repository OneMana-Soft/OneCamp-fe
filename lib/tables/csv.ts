// A table's rows as CSV, for "Export CSV" in the table's More menu: the
// fields shown, in column order, each value as the grid reads it. Pure.

import { isHiddenRef, isNumeric, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { hiddenText, listText } from "@/lib/tables/cellFormat"
import { csvLine } from "@/lib/csv"
import { plainNumberOf } from "@/lib/format/number"

function cellText(v: unknown): string {
  if (v === undefined || v === null) return ""
  // Linked items by name; those the reader can't open as one phrase, never by id.
  if (Array.isArray(v)) return listText(v)
  if (typeof v === "object") {
    const o = v as { label?: unknown; error?: unknown; id?: unknown }
    if (typeof o.error === "string") return "#ERROR"
    if (typeof o.label === "string" && !isHiddenRef(v)) return o.label
    return isHiddenRef(v) || o.id !== undefined ? hiddenText(1) : JSON.stringify(v)
  }
  if (typeof v === "boolean") return v ? "true" : "false"
  return String(v)
}

/**
 * The rows as CSV: a number column's numbers (a formula's or a rollup's
 * too) as numbers, everything else as the grid's text (lib/csv keeps text
 * that starts like a formula as text).
 */
export function toCsv(fields: TableField[], rows: TableRow[]): string {
  const numeric = fields.map(isNumeric)
  const lines = [csvLine(fields.map((f) => f.name))]
  for (const r of rows) {
    const v = parseRowValues(r)
    lines.push(csvLine(fields.map((f, i) => (numeric[i] ? plainNumberOf(v[f.id]) : null) ?? cellText(v[f.id]))))
  }
  return lines.join("\r\n")
}
