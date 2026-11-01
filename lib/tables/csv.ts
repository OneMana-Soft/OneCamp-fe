// A table's rows as CSV, for "Export CSV" in the table's More menu: the
// fields shown, in column order, each value as the grid reads it. Pure.

import { isNumeric, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { csvLine } from "@/lib/csv"
import { exportCell } from "@/lib/tables/cellText"

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
    lines.push(csvLine(fields.map((f, i) => exportCell(f, v[f.id], numeric[i]))))
  }
  return lines.join("\r\n")
}
