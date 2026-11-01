/**
 * A cell as text, the way the grid reads it: one function for "Export CSV"
 * (lib/tables/csv) and for a copy of the grid's cells (tables G1), so what is
 * copied pastes back, into the grid or a spreadsheet, as the export reads.
 * Pure.
 */
import { isHiddenRef, isNumeric, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { hiddenText, listText } from "@/lib/tables/cellFormat"
import { plainNumberOf } from "@/lib/format/number"
import { durationFormat, durationText, idText } from "@/lib/fieldTypes/kindsMore"

/** A B1 kind's cell as a spreadsheet reads it best: a duration as its clock, an id as it's shown (DEAL-12). */
function kindText(f: TableField, v: unknown): string | null {
  if (f.type === "duration" && typeof v === "number") return durationText(v, durationFormat(f))
  if (f.type === "autonumber") return idText(f, v)
  return null
}

function valueText(v: unknown): string {
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
 * One cell as the export writes it: a number column's number (a formula's or
 * a rollup's too) as a number, everything else as the grid's text. `numeric`
 * is isNumeric(f), passed by a caller that works it out once a column.
 */
export function exportCell(f: TableField, v: unknown, numeric: boolean = isNumeric(f)): string | number {
  return kindText(f, v) ?? (numeric ? plainNumberOf(v) : null) ?? valueText(v)
}

/** One cell as text: exportCell, its number written as the CSV writes one. */
export function exportText(f: TableField, v: unknown, numeric?: boolean): string {
  const c = exportCell(f, v, numeric)
  return typeof c === "number" ? (Number.isFinite(c) ? String(c) : "") : c
}

/** A block of cells as text: `rows` by `fields`, a row's values read through `valuesOf` (a cell still saving, as it shows). */
export function blockText(rows: TableRow[], fields: TableField[], valuesOf: (r: TableRow) => Record<string, unknown> = parseRowValues): string[][] {
  const numeric = fields.map(isNumeric)
  return rows.map((r) => {
    const v = valuesOf(r)
    return fields.map((f, i) => exportText(f, v[f.id], numeric[i]))
  })
}
