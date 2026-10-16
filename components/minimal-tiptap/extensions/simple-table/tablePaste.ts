"use client"

/**
 * Pasting rows of text makes a simple table (docs programme B3, editor.md
 * P1-3): tab-separated text (a spreadsheet, a terminal) or comma-separated
 * (a CSV file), its first row the header. A spreadsheet's copy usually
 * carries HTML, which is read as a table already; this is for plain text.
 *
 * The text becomes a table to paste, not a paste of its own, so inside a
 * table its cells fill the table's (prosemirror-tables), and ⇧-paste stays
 * plain text. Prose with commas is left alone: CSV needs the same number of
 * fields on every line, and three lines or three columns; so is indented
 * text, every line of it starting with a tab.
 */

import { Extension, type Editor } from "@tiptap/core"
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/** The most cells a paste makes a table of; more is pasted as text. */
const MAX_CELLS = 2000

/** Fields of CSV text (RFC 4180: quoted fields hold commas, line breaks and ""). Null when a quote is left open. */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === "") quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else field += ch
  }
  if (quoted) return null
  row.push(field)
  rows.push(row)
  return rows
}

/** Rows of cells from pasted text, when it reads as a table; null when it doesn't. */
export function parseDelimited(input: string): string[][] | null {
  const text = input.replace(/\r\n?/g, "\n").replace(/\n+$/, "")
  if (!text.includes("\n")) return null
  const lines = text.split("\n")
  const tabs = lines.map((l) => l.split("\t").length)
  let rows: string[][] | null = null
  if (tabs[0] >= 2 && tabs.every((n) => n === tabs[0]) && !lines.every((l) => l.startsWith("\t"))) rows = lines.map((l) => l.split("\t"))
  else if (!text.includes("\t")) {
    const csv = parseCsv(text)
    const w = csv?.[0].length ?? 0
    if (csv && w >= 2 && csv.every((r) => r.length === w) && (csv.length >= 3 || w >= 3)) rows = csv
  }
  if (!rows || rows.length < 2 || rows.length * rows[0].length > MAX_CELLS) return null
  return rows.map((r) => r.map((c) => c.trim()))
}

/** A table of text, its first row the header; a field's line breaks stay line breaks. */
export function tableOf(schema: Schema, rows: string[][]) {
  const inline = (text: string) =>
    text.split("\n").flatMap((part, i): PMNode[] => [...(i ? [schema.nodes.hardBreak?.create() ?? schema.text(" ")] : []), ...(part ? [schema.text(part)] : [])])
  const cell = (type: "tableHeader" | "tableCell", text: string) => schema.nodes[type].create(null, schema.nodes.paragraph.create(null, inline(text)))
  return schema.nodes.table.create(
    null,
    rows.map((r, i) => schema.nodes.tableRow.create(null, r.map((c) => cell(i === 0 ? "tableHeader" : "tableCell", c)))),
  )
}

export const TablePaste = Extension.create({
  name: "tablePaste",
  addProseMirrorPlugins() {
    const editor: Editor = this.editor
    return [
      new Plugin({
        key: new PluginKey("tablePaste"),
        props: {
          clipboardTextParser(text, $context, plain) {
            if (plain || $context.parent.type.spec.code || !editor.schema.nodes.table) return null as unknown as Slice
            const rows = parseDelimited(text)
            if (!rows) return null as unknown as Slice
            return new Slice(Fragment.from(tableOf(editor.schema, rows)), 0, 0)
          },
        },
      }),
    ]
  },
})
