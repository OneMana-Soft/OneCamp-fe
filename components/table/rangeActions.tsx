"use client"

/**
 * A grid range's writes (tables G1: gsheets-grid-01, airtable-04): a paste, a
 * fill and a clear, each ONE batch (lib/tables/pastePlan), so one Undo takes
 * it back; the toast that says what was written and what was left out; and,
 * when the server refuses some cells, which and why, with "Paste the rest".
 * Part of the range's piece (rangePiece), a chunk of its own off the table's
 * first load that imports no code another page loads: the grid's eager shell
 * (gridRange) hands it the toasts, the batch and its undo, the server's words
 * for a failure, which fields people write and a cell's text (RangeKit).
 *
 * Who may write a table's rows may paste, fill and clear them: the server
 * checks every cell as the viewer (Batch), and someone who can only view the
 * table hears so in words (403).
 *
 * Each write goes through the grid's one edit path (cellsWrite on the
 * grid's record), so its cells show at once, as they will read, and a paste's
 * new rows after the last, until the server answers; a refusal puts them back
 * and says why. Once saved, it offers its own Undo (the toast). A Ctrl+Z
 * pressed while it's on its way takes it back instead (undoOrder), and then
 * it offers none (V-360).
 */

import type * as React from "react"
import { boxSize, pasteBox, tileBlock, type Box } from "@/lib/tables/cellRange"
import { blockFromClipboard } from "@/lib/tables/clipboardGrid"
import { BATCH_MAX } from "@/lib/tables/batchLimit"
import type { BatchInput, BatchResult } from "@/lib/tables/ledger"
import { writeCells, type CellsRecord, type CellsWrite } from "@/lib/tables/cellsWrite"
import { batchCells, clearPlan, fillPlan, pastePlan, refusalLines, refusedCells, withoutRefused, type PlannedWrite, type Writable } from "@/lib/tables/pastePlan"
import type { TableField, TableRow } from "@/services/tableService"
import { placeOfRow, rowAtPlace } from "@/lib/tables/viewPlaces"
import { EDITORS_CHOSEN, READ_ONLY_WORDS } from "@/lib/tables/readOnlyWords"

/** What a range's writes need from the grid, as of the write. */
export interface GridWrites {
  tableId: string
  /** Whether the reader edits the table's rows (V-170): one who may only view it pastes, fills and clears nothing. */
  canEdit: boolean
  /** The rows shown, in the grid's order: a range's rows are their indexes. */
  rows: () => TableRow[]
  /** The fields shown, in the grid's order: a range's columns are their indexes. */
  fields: () => TableField[]
  /** A row's values as its cells show them. */
  valuesOf: (row: TableRow) => Record<string, unknown>
  /** The view as of now: the rows given (read from place `from`, then `tail` added here), its count, and its next read (onNearEnd). */
  view: () => { given: number; tail: number; from?: number; count?: number; grouped: boolean; onNearEnd?: (last: number, first?: number) => void }
  /** A row's place in the view (0-based), for what a refusal says. */
  placeOf: (rowId: string) => number | null
  offerUndo: (title: string, undo: () => unknown, description?: string, action?: string) => void
  onChange: () => void
  onCreated?: (rows: TableRow[]) => void
  /** Selects a block once it's written. */
  select: (box: Box) => void
  /** The grid's edit record, for a write of many cells (cellsWrite): shown at once, in order, taken by an Undo on its way. */
  cells: CellsRecord
  /** Takes a batch's change set back: the toasts' one Undo path (useCellCommit's undo), in the table's order of writes. */
  undo: (changeSet: string) => Promise<unknown>
}

/** A toast the shell shows: its words, and a button that acts. */
export interface RangeToast {
  tone: "warning" | "error"
  title: string
  description?: React.ReactNode
  action?: { label: string; run: () => void }
}

/** What the piece can't import, handed over by the eager shell (gridRange): code other pages load. */
export interface RangeKit {
  say: (t: RangeToast) => void
  /** One batch of the table's rows, its refusal said here (the ledger's batchRows, its own errors). */
  batch: (input: BatchInput) => Promise<BatchResult>
  /** A failed request: its status, and the server's words for it (or `fallback`). */
  failure: (e: unknown, fallback: string) => { status?: number; message: string }
  /** Whether people write a field's cells (the field kinds' stored). */
  writable: Writable
  /** A pasted cell's text as its field's kind reads it (the kind's parse), for the cell to show until the server answers; the text, when the kind reads none. */
  read: (field: TableField, text: string) => unknown
  /** A block of cells as text, as the export writes them (lib/tables/cellText). */
  text: (rows: TableRow[], fields: TableField[]) => string[][]
  /** A count in the reader's digits. */
  count: (n: number) => string
}

export type RangeWrites = GridWrites & RangeKit

type Verb = "paste" | "fill" | "clear"
const DONE: Record<Verb, string> = { paste: "Pasted", fill: "Filled", clear: "Cleared" }
const PAST: Record<Verb, string> = { paste: "pasted", fill: "filled", clear: "cleared" }
const REST: Record<Verb, string> = { paste: "Paste the rest", fill: "Fill the rest", clear: "Clear the rest" }
/** What a write is, for an Undo that finds it wasn't saved: "That fill wasn't saved". */
const WHAT: Record<Verb, string> = { paste: "paste", fill: "fill", clear: "change" }
/** How many refusals a toast lists before "and N more". */
const LISTED = 3

const cellsText = (w: RangeKit, n: number) => `${w.count(n)} ${n === 1 ? "cell" : "cells"}`

/** Names in a sentence: "A", "A and B", "A, B and C", "A, B and 3 more". */
function namesText(w: RangeKit, names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  if (names.length <= 3) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(", ")} and ${w.count(names.length - 2)} more`
}

/** What a write left out, in words: fields the table works out, and columns past the last field. */
function leftOut(w: RangeKit, plan: { readOnly: string[]; pastRight?: number }): string | undefined {
  const parts: string[] = []
  const n = plan.readOnly.length
  if (n) parts.push(`${namesText(w, plan.readOnly)} ${n === 1 ? "is" : "are"} worked out by the table, so ${n === 1 ? "it was" : "they were"} left as ${n === 1 ? "it is" : "they are"}.`)
  const past = plan.pastRight ?? 0
  if (past) parts.push(`${w.count(past)} ${past === 1 ? "column" : "columns"} past the last field ${past === 1 ? "was" : "were"} left out.`)
  return parts.length ? parts.join(" ") : undefined
}

/** Whether the reader may write the range; one who may only view the table (V-170) is told so, in the server's words, and nothing is planned. */
function mayWrite(w: RangeWrites): boolean {
  if (w.canEdit) return true
  w.say({ tone: "warning", title: READ_ONLY_WORDS, description: EDITORS_CHOSEN })
  return false
}

const tooMany = (w: RangeKit) =>
  w.say({ tone: "warning", title: `Paste up to ${w.count(BATCH_MAX)} rows at a time`, description: "For a bigger sheet, use Import rows… in the table's menu." })

/** A refusal's lines, the first few and how many more. */
function Lines({ lines, count }: { lines: string[]; count: (n: number) => string }) {
  return (
    <span className="block">
      {lines.slice(0, LISTED).map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
      {lines.length > LISTED ? <span className="block">and {count(lines.length - LISTED)} more</span> : null}
    </span>
  )
}

/** A batch's cells and new rows as they will read, by the rows drawn now: a paste's text as its field's kind reads it. */
function shown(w: RangeWrites, input: BatchInput, pasted: boolean): Pick<CellsWrite, "cells" | "adding"> {
  const rows = new Map(w.rows().map((r) => [r.id, r]))
  const fields = new Map(w.fields().map((f) => [f.id, f]))
  const read = (values: Record<string, unknown>) =>
    pasted
      ? Object.fromEntries(
          Object.entries(values).map(([id, v]) => {
            const f = fields.get(id)
            return [id, f && typeof v === "string" ? w.read(f, v) : v]
          }),
        )
      : values
  return {
    cells: (input.patch ?? []).flatMap((p) => {
      const row = rows.get(p.row)
      return row ? [{ row, values: read(p.values) }] : []
    }),
    adding: input.create?.map((c) => read(c.values)),
  }
}

/**
 * One batch, through the grid's one edit path: its cells show at once, then
 * the toast with Undo (for more than one cell, or with something left out),
 * the rows read again. Null when refused or failed (said), or when an Undo
 * pressed while it was on its way took it back (that Undo says so).
 */
async function write(w: RangeWrites, verb: Verb, plan: Pick<PlannedWrite, "input">, note?: string): Promise<BatchResult | null> {
  const cells = batchCells(plan.input)
  if (!cells) {
    w.say({ tone: "warning", title: `Nothing to ${verb} there`, description: note })
    return null
  }
  let done: { answer: BatchResult; undone: boolean }
  try {
    done = await writeCells(w.cells, { what: WHAT[verb], ...shown(w, plan.input, verb === "paste"), send: () => w.batch(plan.input) })
  } catch (e) {
    refused(w, verb, plan.input, e)
    return null
  }
  if (done.undone) return null
  const { answer } = done
  const set = answer.change_set
  const title = `${DONE[verb]} ${cellsText(w, cells)}`
  // A batch that changed nothing names no change set (V-360) and offers no Undo: one would take the change before it.
  if (set && (cells > 1 || note)) w.offerUndo(title, () => w.undo(set), note)
  else if (!set && note) w.say({ tone: "warning", title, description: note })
  const made = (answer.created ?? []).filter((r) => r?.id)
  if (made.length && w.onCreated) w.onCreated(made)
  w.onChange()
  return answer
}

/** A write the server refused: its cells and why, with the rest to send; someone who can only view the table, in words; anything else, as the server says it. */
function refused(w: RangeWrites, verb: Verb, input: BatchInput, e: unknown) {
  const cells = refusedCells(e)
  if (cells) {
    const rest = withoutRefused(input, cells)
    w.say({
      tone: "error",
      title: `${cellsText(w, cells.length)} can't be ${PAST[verb]}`,
      description: <Lines lines={refusalLines(cells, { fields: w.fields(), placeOf: w.placeOf })} count={w.count} />,
      action: batchCells(rest) ? { label: REST[verb], run: () => void write(w, verb, { input: rest }) } : undefined,
    })
    return
  }
  const { status, message } = w.failure(e, "Try again in a moment.")
  if (status === 403) return void w.say({ tone: "error", title: "You can view this table, not change it" })
  w.say({ tone: "error", title: `Couldn't ${verb} those cells`, description: message })
}

/**
 * Reads the view's places `top` through `last` first, as scrolling to them
 * would (onNearEnd). Places, not indexes: a read before the rows given (or a
 * jump) moves their indexes. A page that stops reading (its rows held until
 * Load all) won't cover them: false, and the paste says so instead of adding rows.
 */
async function readThrough(w: GridWrites, top: number, last: number): Promise<boolean> {
  const covered = () => {
    const v = w.view()
    if (v.grouped || !v.onNearEnd) return true
    // Paged (no count): the rows given are the view's first.
    if (v.count === undefined) return v.given - v.tail > last
    for (let p = top; p <= last && p < v.count; p++) if (rowAtPlace(p, v.given, v.count, v.tail, v.from ?? 0) < 0) return false
    return true
  }
  const end = Date.now() + 10_000
  let seen = ""
  let since = Date.now()
  while (!covered()) {
    const v = w.view()
    const now = `${v.from}:${v.given}`
    if (now !== seen) {
      seen = now
      since = Date.now()
    }
    if (Date.now() > end || Date.now() - since > 3_000) return false
    v.onNearEnd?.(last, top)
    await new Promise((r) => setTimeout(r, 100))
  }
  return true
}

/** A row given's place in the view, and the row given at a place (-1: none), as the view is now. */
const placeAt = (w: GridWrites, index: number) => {
  const v = w.view()
  return v.grouped || v.count === undefined ? index : placeOfRow(index, v.given, v.count, v.tail, v.from ?? 0)
}
const indexAt = (w: GridWrites, place: number) => {
  const v = w.view()
  return v.grouped || v.count === undefined ? place : rowAtPlace(place, v.given, v.count, v.tail, v.from ?? 0)
}

/**
 * A block from the clipboard over a range: a lone cell takes the block's
 * size, a range a whole multiple of it is filled whole (as Sheets tiles it).
 * The rows it covers are read first; rows past the view's end are new rows.
 */
export async function pasteCells(w: RangeWrites, clip: { text: string; html: string }, range: Box): Promise<void> {
  if (!mayWrite(w)) return
  const block = blockFromClipboard({ text: clip.text, html: clip.html })
  const size = { rows: block.length, cols: Math.max(0, ...block.map((line) => line.length)) }
  if (!size.rows || !size.cols) return
  const into = pasteBox(range, size)
  const whole = boxSize(into)
  const cells = into === range ? tileBlock(block, whole.rows, whole.cols) : block
  if (cells.length > BATCH_MAX) return void tooMany(w)
  // Its rows by their places: reading them may move their indexes.
  const start = placeAt(w, into.top)
  if (!(await readThrough(w, start, start + cells.length - 1))) {
    w.say({ tone: "error", title: "Couldn't read the rows to paste over", description: "Load every row, then paste again." })
    return
  }
  const top = indexAt(w, start)
  if (top < 0) return void w.say({ tone: "error", title: "Couldn't read the rows to paste over", description: "Scroll to them, then paste again." })
  const last = top + cells.length - 1
  const fields = w.fields()
  const plan = pastePlan({ block: cells, left: into.left, rows: w.rows().slice(top, top + cells.length), fields, writable: w.writable })
  if (plan.tooMany) return void tooMany(w)
  const done = await write(w, "paste", plan, leftOut(w, plan))
  const width = Math.max(0, ...cells.map((line) => line.length))
  if (done) w.select({ top, left: into.left, bottom: last, right: Math.min(into.left + width, fields.length) - 1 })
}

/** The fill handle, or Ctrl/Cmd+D (copy): the source rows' cells continued (or copied) over the rows `to`, in the range's columns. */
export async function fillCells(
  w: RangeWrites,
  a: { left: number; right: number; source: { top: number; bottom: number }; to: { top: number; bottom: number }; up?: boolean; copy?: boolean },
): Promise<void> {
  if (!mayWrite(w)) return
  const rows = w.rows()
  const source = rows.slice(a.source.top, a.source.bottom + 1).map((r) => ({ values: w.valuesOf(r) }))
  const targets = rows.slice(a.to.top, a.to.bottom + 1)
  if (!source.length || !targets.length) return
  const plan = fillPlan({ source, targets, fields: w.fields().slice(a.left, a.right + 1), writable: w.writable, up: a.up, copy: a.copy })
  const done = await write(w, "fill", plan, leftOut(w, plan))
  if (done) w.select({ top: Math.min(a.source.top, a.to.top), left: a.left, bottom: Math.max(a.source.bottom, a.to.bottom), right: a.right })
}

/** Delete on a range of more than one cell: its writable cells emptied. */
export async function clearCells(w: RangeWrites, box: Box): Promise<void> {
  if (!mayWrite(w)) return
  const plan = clearPlan({ rows: w.rows().slice(box.top, box.bottom + 1), fields: w.fields().slice(box.left, box.right + 1), writable: w.writable })
  await write(w, "clear", plan, leftOut(w, plan))
}
