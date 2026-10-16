"use client"

/**
 * Turn into database (docs programme B3, editor.md P1-3): a simple table's
 * rows become a OneCamp table, with a text column for each of its columns
 * (named by its header row, if it has one), and the doc embeds that table
 * where the simple one was.
 *
 * Who can see it follows the doc: a table made from a private doc is private
 * (D-5), so nothing in it reaches people the doc wasn't shared with. Sharing
 * it with the doc's people is C3's (N16).
 *
 * The rows are written through the table API, one request each, and the doc
 * changes only once they all are. If the table was edited meanwhile, or a
 * request fails, the new table is deleted and the doc keeps its own.
 */

import type { Editor } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { TableMap } from "@tiptap/pm/tables"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { createField, createRow, createTable, deleteTable, tableFieldsKey, updateField, type TableField } from "@/services/tableService"
import { toast } from "@/hooks/use-toast"
import { busFor } from "@/components/docEditor/registry/commandBus"

/** The table as text, a row of cells each; a merged cell's text in its first place only. */
export function gridOf(table: PMNode): { header: string[] | null; rows: string[][] } {
  const map = TableMap.get(table)
  const seen = new Set<number>()
  const grid: string[][] = []
  for (let r = 0; r < map.height; r++) {
    const row: string[] = []
    for (let c = 0; c < map.width; c++) {
      const at = map.map[r * map.width + c]
      const cell = table.nodeAt(at)
      row.push(seen.has(at) || !cell ? "" : cell.textBetween(0, cell.content.size, "\n").trim())
      seen.add(at)
    }
    grid.push(row)
  }
  const first = table.firstChild
  let headed = !!first && first.childCount > 0
  first?.forEach((cell) => {
    if (cell.type.name !== "tableHeader") headed = false
  })
  return headed ? { header: grid[0], rows: grid.slice(1) } : { header: null, rows: grid }
}

/** Column names: the header's, else "Column 1"…, each once. */
export function columnNames(header: string[] | null, width: number): string[] {
  const used = new Set<string>()
  return Array.from({ length: width }, (_, i) => {
    const base = header?.[i]?.replace(/\s+/g, " ").trim().slice(0, 100) || `Column ${i + 1}`
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} ${n}`
    used.add(name.toLowerCase())
    return name
  })
}

/** The doc's title and whether it's private, as the doc's page knows them. */
async function docOf(docId: string): Promise<{ title: string; private: boolean }> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetDocInfo}/${docId}`)
  const doc = res.data?.data as { doc_title?: string; doc_private?: boolean } | undefined
  return { title: doc?.doc_title?.trim() || "", private: doc?.doc_private !== false }
}

/** Runs work n at a time, in order of starting. */
async function inBatches<T>(items: T[], n: number, work: (item: T, i: number) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map((item, j) => work(item, i + j)))
}

/** Where the table is now: found by its block id, or still at pos. */
function findAgain(editor: Editor, pos: number, original: PMNode): number | null {
  const id = original.attrs.blockId as string | null
  const at = editor.state.doc.nodeAt(pos)
  if (at === original || (!id && at?.eq(original))) return pos
  if (!id) return null
  let found: number | null = null
  editor.state.doc.descendants((n, p) => {
    if (found != null) return false
    if (n.type.name === "table" && n.attrs.blockId === id) found = p
    return n.isBlock && !n.isTextblock
  })
  return found
}

export async function turnIntoDatabase(editor: Editor, pos: number): Promise<void> {
  const original = editor.state.doc.nodeAt(pos)
  const docId = busFor(editor)?.docId
  if (!original || original.type.name !== "table" || !editor.isEditable) return
  if (!docId) {
    toast({ title: "Couldn't turn the table into a database", description: "Open the doc on its own page, then try again.", variant: "destructive" })
    return
  }
  const { header, rows } = gridOf(original)
  const width = TableMap.get(original).width
  const names = columnNames(header, width)
  const progress = toast({ title: "Turning the table into a database…", tone: "loading" })
  let tableId: string | null = null
  try {
    const doc = await docOf(docId)
    const table = await createTable({ name: doc.title ? `${doc.title} table` : "Untitled table", visibility: doc.private ? "private" : "workspace" })
    tableId = table.id
    const res = await axiosInstance.get(tableFieldsKey(table.id))
    const seeded = ((res.data?.data ?? []) as TableField[]).sort((a, b) => a.position - b.position)
    const ids: string[] = []
    // The table starts with a text column (its name): it becomes the first, renamed.
    if (seeded[0]) {
      await updateField(table.id, seeded[0].id, { name: names[0] })
      ids.push(seeded[0].id)
    }
    for (let i = ids.length; i < width; i++) ids.push((await createField(table.id, { name: names[i], type: "text", position: i })).id)
    await inBatches(rows, 4, (row, i) => createRow(table.id, Object.fromEntries(ids.map((id, c) => [id, row[c] ?? ""])), (i + 1) * 1000))

    const at = findAgain(editor, pos, original)
    const now = at == null ? null : editor.state.doc.nodeAt(at)
    if (at == null || !now || !now.eq(original) || editor.isDestroyed) throw new Error("changed")
    const embed = editor.schema.nodes.tableEmbed?.create({ tableId: table.id })
    if (!embed) throw new Error("no embed")
    editor.view.dispatch(editor.state.tr.replaceWith(at, at + now.nodeSize, embed).scrollIntoView())
    progress.update({
      id: progress.id,
      title: "Turned into a database",
      description: doc.private ? "It's private, like this doc. Share it from the table to let others see it." : "Everyone in the workspace can see it, as they can this doc.",
      tone: "success",
      duration: 6000,
    })
  } catch (e) {
    if (tableId) void deleteTable(tableId).catch(() => undefined)
    const changed = e instanceof Error && e.message === "changed"
    progress.update({
      id: progress.id,
      title: "Couldn't turn the table into a database",
      description: changed ? "The table changed while it was being copied. It's as it was; try again." : "The table is as it was. Check your connection, then try again.",
      variant: "destructive",
      tone: "error",
    })
  }
}
