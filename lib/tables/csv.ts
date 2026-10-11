// A table's rows as CSV, for "Export CSV" in the table's More menu: the
// fields shown, in column order, each value as the grid reads it. Pure.

import { parseRowValues, type TableField, type TableRow } from "@/services/tableService"

function cellText(v: unknown): string {
  if (v === undefined || v === null) return ""
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? String((x as { label?: unknown }).label ?? "") : String(x))).join(", ")
  if (typeof v === "object") {
    const o = v as { label?: unknown; error?: unknown }
    if (typeof o.error === "string") return "#ERROR"
    return typeof o.label === "string" ? o.label : JSON.stringify(v)
  }
  if (typeof v === "boolean") return v ? "true" : "false"
  return String(v)
}

const quote = (s: string) => (/[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s)

export function toCsv(fields: TableField[], rows: TableRow[]): string {
  const head = fields.map((f) => quote(f.name)).join(",")
  const body = rows.map((r) => {
    const v = parseRowValues(r)
    return fields.map((f) => quote(cellText(v[f.id]))).join(",")
  })
  return [head, ...body].join("\r\n")
}
