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
 */

import type * as React from "react"
import { boxSize, pasteBox, tileBlock, type Box } from "@/lib/tables/cellRange"
import { blockFromClipboard } from "@/lib/tables/clipboardGrid"
import { BATCH_MAX } from "@/lib/tables/batchLimit"
import type { BatchInput, BatchResult } from "@/lib/tables/ledger"
import { batchCells, clearPlan, fillPlan, pastePlan, refusalLines, refusedCells, withoutRefused, type PlannedWrite, type Writable } from "@/lib/tables/pastePlan"
import type { TableField, TableRow } from "@/services/tableService"

/** What a range's writes need from the grid, as of the write. */
export interface GridWrites {
  tableId: string
  /** The rows shown, in the grid's order: a range's rows are their indexes. */
  rows: () => TableRow[]
  /** The fields shown, in the grid's order: a range's columns are their indexes. */
  fields: () => TableField[]
  /** A row's values as its cells show them. */
  valuesOf: (row: TableRow) => Record<string, unknown>
  /** The view as of now: the rows given (`tail` of them added here, after the rows read), its count, and its next read (onNearEnd). */
  view: () => { given: number; tail: number; count?: number; grouped: boolean; onNearEnd?: (last: number) => void }
  /** A row's place in the view (0-based), for what a refusal says. */
  placeOf: (rowId: string) => number | null
  offerUndo: (title: string, undo: () => unknown, description?: string, action?: string) => void
  onChange: () => void
  onCreated?: (rows: TableRow[]) => void
  /** Selects a block once it's written. */
  select: (box: Box) => void
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
  /** Takes a batch's change set back (the ledger's undoChange). */
  undo: (changeSet: string) => Promise<unknown>
  /** A failed request: its status, and the server's words for it (or `fallback`). */
  failure: (e: unknown, fallback: string) => { status?: number; message: string }
  /** Whether people write a field's cells (the field kinds' stored). */
  writable: Writable
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

/** One batch: the toast with Undo (for more than one cell, or with something left out), the rows read again. Null when refused or failed (said). */
async function write(w: RangeWrites, verb: Verb, plan: Pick<PlannedWrite, "input">, note?: string): Promise<BatchResult | null> {
  const cells = batchCells(plan.input)
  if (!cells) {
    w.say({ tone: "warning", title: `Nothing to ${verb} there`, description: note })
    return null
  }
  let done: BatchResult
  try {
    done = await w.batch(plan.input)
  } catch (e) {
    refused(w, verb, plan.input, e)
    return null
  }
  if (cells > 1 || note) w.offerUndo(`${DONE[verb]} ${cellsText(w, cells)}`, () => w.undo(done.change_set), note)
  const made = (done.created ?? []).filter((r) => r?.id)
  if (made.length && w.onCreated) w.onCreated(made)
  w.onChange()
  return done
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
 * Reads the view's rows through index `last` first, as scrolling to them would
 * (onNearEnd): the rows read reach past it, or reach the rows added here, or
 * the page holds every row. A page that stops reading (its rows held until
 * Load all) won't cover it: false, and the paste says so instead of adding rows.
 */
async function readThrough(w: GridWrites, last: number): Promise<boolean> {
  const covered = () => {
    const v = w.view()
    const read = v.given - v.tail
    return v.grouped || read > last || (v.count !== undefined && read >= v.count - v.tail) || !v.onNearEnd
  }
  const end = Date.now() + 10_000
  let seen = -1
  let since = Date.now()
  while (!covered()) {
    const n = w.view().given
    if (n !== seen) {
      seen = n
      since = Date.now()
    }
    if (Date.now() > end || Date.now() - since > 3_000) return false
    w.view().onNearEnd?.(last)
    await new Promise((r) => setTimeout(r, 100))
  }
  return true
}

/**
 * A block from the clipboard over a range: a lone cell takes the block's
 * size, a range a whole multiple of it is filled whole (as Sheets tiles it).
 * The rows it covers are read first; rows past the view's end are new rows.
 */
export async function pasteCells(w: RangeWrites, clip: { text: string; html: string }, range: Box): Promise<void> {
  const block = blockFromClipboard({ text: clip.text, html: clip.html })
  const size = { rows: block.length, cols: Math.max(0, ...block.map((line) => line.length)) }
  if (!size.rows || !size.cols) return
  const into = pasteBox(range, size)
  const whole = boxSize(into)
  const cells = into === range ? tileBlock(block, whole.rows, whole.cols) : block
  if (cells.length > BATCH_MAX) return void tooMany(w)
  const last = into.top + cells.length - 1
  if (!(await readThrough(w, last))) {
    w.say({ tone: "error", title: "Couldn't read the rows to paste over", description: "Load every row, then paste again." })
    return
  }
  const fields = w.fields()
  const plan = pastePlan({ block: cells, left: into.left, rows: w.rows().slice(into.top, into.top + cells.length), fields, writable: w.writable })
  if (plan.tooMany) return void tooMany(w)
  const done = await write(w, "paste", plan, leftOut(w, plan))
  const width = Math.max(0, ...cells.map((line) => line.length))
  if (done) w.select({ top: into.top, left: into.left, bottom: last, right: Math.min(into.left + width, fields.length) - 1 })
}

/** The fill handle, or Ctrl/Cmd+D (copy): the source rows' cells continued (or copied) over the rows `to`, in the range's columns. */
export async function fillCells(
  w: RangeWrites,
  a: { left: number; right: number; source: { top: number; bottom: number }; to: { top: number; bottom: number }; up?: boolean; copy?: boolean },
): Promise<void> {
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
  const plan = clearPlan({ rows: w.rows().slice(box.top, box.bottom + 1), fields: w.fields().slice(box.left, box.right + 1), writable: w.writable })
  await write(w, "clear", plan, leftOut(w, plan))
}
