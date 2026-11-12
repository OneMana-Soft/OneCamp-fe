// A table's view on paper: "Print or save as PDF" in the table's More menu
// (scorecard gsheets-import-02, item 2). Every row the view shows, in its
// order, read as Export CSV reads them (lib/tables/exportRows); its shown
// fields in their order, at the grid's widths as shares of the page; each
// cell as the CSV writes it, a number right-aligned; the header row on every
// page; a grouped view's headings. Through the browser's print dialog, which
// saves the PDF (lib/export/print printHost); its style only while printing, and
// always light. Read on use, with the export: never the table's first screen.

import { isNumeric, type TableField, type TableRow } from "@/services/tableService"
import { columnWidth } from "@/lib/tables/display"
import { blockText } from "@/lib/tables/cellText"
import { groupRows } from "@/lib/tables/applyRules"
import { groupLabel } from "@/lib/tables/groups"
import { fitRules, NO_RULES, type GroupRule } from "@/lib/tables/viewRules"
import { formatLocale } from "@/lib/tables/numberFormat"
import { printHost } from "@/lib/export/print"

/**
 * The most rows a print takes. The print dialog lays out every page before it
 * shows one: 5,000 rows is about 125 pages at 40 a page, past which it stalls
 * for many seconds (longest on a phone) and the paper is no way to read the
 * view. A bigger view is a file: Export CSV or Excel.
 */
export const MAX_PRINT_ROWS = 5_000

/** The grid's widths, in px, that a portrait page holds without squeezing its columns: past them it prints landscape. */
const PORTRAIT_PX = 1_000

export interface PrintSheet {
  title: string
  /** Each shown field's name, whether it holds numbers (right-aligned), and its share of the page's width, in %. */
  columns: { name: string; numeric: boolean; share: number }[]
  /** In the view's order: a group's heading (its depth, from 0), or a row's cells. */
  lines: ({ heading: string; depth: number } | { cells: string[] })[]
  /** How many rows (headings aren't rows). */
  rows: number
  landscape: boolean
}

const rowsText = (n: number) => `${formatLocale(n, {})} ${n === 1 ? "row" : "rows"}`

/**
 * The view as it prints: `shown` (the fields shown, in their order) over
 * `rows` (the rows the view shows, in its order), each column at the grid's
 * width (`widths`, else the width the grid gives its kind); a heading where
 * each of the view's groups (`groups`, of `fields`) starts. Pure.
 */
export function printSheet(title: string, shown: TableField[], rows: TableRow[], widths: Record<string, number>, fields: TableField[], groups: GroupRule[] = []): PrintSheet {
  const px = shown.map((f) => widths[f.id] || columnWidth(f))
  const wide = px.reduce((a, b) => a + b, 0)
  const columns = shown.map((f, i) => ({ name: f.name, numeric: isNumeric(f), share: Math.round((px[i] / (wide || 1)) * 10_000) / 100 }))
  const levels = groups.length ? (fitRules({ ...NO_RULES, groups }, fields).groups ?? []) : []
  const starts = (levels.length ? groupRows(rows, fields, levels) : null) ?? []
  const byId = new Map(fields.map((f) => [f.id, f]))
  const lines: PrintSheet["lines"] = []
  let g = 0
  blockText(rows, shown).forEach((cells, i) => {
    for (; g < starts.length && starts[g].from === i; g++) {
      const { key, count } = starts[g]
      const depth = key.length - 1
      const f = byId.get(levels[depth].field) as TableField
      lines.push({ heading: `${f.name}: ${groupLabel(f, key[depth], levels[depth].granularity)} · ${rowsText(count)}`, depth })
    }
    lines.push({ cells })
  })
  return { title, columns, lines, rows: rows.length, landscape: wide > PORTRAIT_PX }
}

const CSS =
  "[data-table-print]{color:#000;font:9pt/1.35 system-ui,-apple-system,'Segoe UI',sans-serif}" +
  "[data-table-print] h1{font-size:14pt;font-weight:600;margin:0 0 1mm}" +
  "[data-table-print] p{margin:0 0 4mm;color:#555}" +
  "[data-table-print] table{width:100%;border-collapse:collapse;table-layout:fixed}" +
  "[data-table-print] th,[data-table-print] td{border:.5pt solid #bbb;padding:1mm 1.5mm;text-align:left;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}" +
  "[data-table-print] thead th{background:#f1f1f1;font-weight:600;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  "[data-table-print] tbody th{font-weight:600;background:#fafafa;-webkit-print-color-adjust:exact;print-color-adjust:exact}" +
  "[data-table-print] .n{text-align:right;font-variant-numeric:tabular-nums}"

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  parent?.appendChild(node)
  return node
}

/** Prints the sheet, through the print dialog: its title names the PDF. Text alone, never markup, goes in. */
export function printView(sheet: PrintSheet): void {
  const fill = (host: HTMLElement) => {
    el("h1", sheet.title, host)
    el("p", sheet.columns.length ? rowsText(sheet.rows) : "This view shows no fields.", host)
    if (!sheet.columns.length) return
    const table = el("table", undefined, host)
    const cols = el("colgroup", undefined, table)
    for (const c of sheet.columns) el("col", undefined, cols).style.width = `${c.share}%`
    const head = el("tr", undefined, el("thead", undefined, table))
    for (const c of sheet.columns) {
      const th = el("th", c.name, head)
      th.scope = "col"
      if (c.numeric) th.className = "n"
    }
    const body = el("tbody", undefined, table)
    for (const line of sheet.lines) {
      const tr = el("tr", undefined, body)
      if ("heading" in line) {
        const th = el("th", line.heading, tr)
        th.colSpan = sheet.columns.length
        th.scope = "colgroup"
        th.style.paddingLeft = `${1.5 + line.depth * 4}mm`
        tr.setAttribute("data-group", String(line.depth))
        continue
      }
      line.cells.forEach((text, i) => {
        const td = el("td", text, tr)
        if (sheet.columns[i].numeric) td.className = "n"
      })
    }
    if (!sheet.lines.length) el("td", "No rows in this view.", el("tr", undefined, body)).colSpan = sheet.columns.length
  }
  printHost("table", fill, CSS + (sheet.landscape ? "@page{size:landscape}" : ""), sheet.title)
}
