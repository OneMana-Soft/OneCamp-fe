/**
 * A grid's paste, fill and clear as ONE batch each (tables G1,
 * gsheets-grid-01, airtable-04): one change set that one Ctrl+Z takes back.
 * The server checks and reads every cell into its kind (Batch), so cells go
 * as the text pasted; the plan only decides which cells, which rows and which
 * new rows. Pure, and part of the grid's range piece, which imports no code
 * another page loads: which fields people write comes from the caller
 * (`writable`, the field kinds' `stored`).
 */
import type { Block } from "@/lib/tables/clipboardGrid"
import { fillSeries } from "@/lib/tables/fillSeries"
import { BATCH_MAX } from "@/lib/tables/batchLimit"
import type { BatchInput } from "@/lib/tables/ledger"
import type { TableField } from "@/services/tableService"

/** Whether people write a field's cells: stored kinds, not a formula's, a rollup's or the row's own (fieldKind(type).stored). */
export type Writable = (f: TableField) => boolean

export interface PlannedWrite {
  input: BatchInput
  /** The cells it writes. */
  cells: number
  /** Fields it reached that nobody writes (formulas, rollups, times, numbers made by the table), by name. */
  readOnly: string[]
}

export interface PastePlan extends PlannedWrite {
  /** The block's columns past the grid's last field, left out. */
  pastRight: number
  /** More rows than one batch writes (BATCH_MAX): nothing is planned. */
  tooMany: boolean
}

/** The fields a write reaches, split into those it writes and the names of those nobody writes. */
function split(fields: TableField[], writable: Writable): { write: TableField[]; readOnly: string[] } {
  return { write: fields.filter(writable), readOnly: fields.filter((f) => !writable(f)).map((f) => f.name) }
}

/**
 * A block pasted with its top-left at column `left` of the first of `rows`:
 * the view's rows from the paste's top, every one the block covers up to the
 * view's end (read first by the caller). The block's rows past them are new
 * rows, made after the table's last row; a new row with nothing in it isn't
 * made. An empty cell empties its cell. No version is named, so an edit to
 * another cell of a row never refuses the paste.
 */
export function pastePlan(a: { block: Block; left: number; rows: { id: string }[]; fields: TableField[]; writable: Writable }): PastePlan {
  const width = Math.max(0, ...a.block.map((line) => line.length))
  const reached = a.fields.slice(a.left, a.left + width)
  const pastRight = Math.max(0, width - reached.length)
  const { readOnly } = split(reached, a.writable)
  if (a.block.length > BATCH_MAX) return { input: { kind: "paste" }, cells: 0, readOnly, pastRight, tooMany: true }
  const patch: NonNullable<BatchInput["patch"]> = []
  const create: NonNullable<BatchInput["create"]> = []
  let cells = 0
  a.block.forEach((line, r) => {
    const values: Record<string, unknown> = {}
    let filled = false
    reached.forEach((f, c) => {
      if (!a.writable(f)) return
      const text = line[c] ?? ""
      values[f.id] = text === "" ? null : text
      if (text !== "") filled = true
    })
    const named = Object.keys(values).length
    if (!named) return
    const row = a.rows[r]
    if (row) {
      patch.push({ row: row.id, values })
      cells += named
    } else if (filled) {
      create.push({ values })
      cells += named
    }
  })
  const input: BatchInput = { kind: "paste" }
  if (patch.length) input.patch = patch
  if (create.length) input.create = create
  return { input, cells, readOnly, pastRight, tooMany: false }
}

/** The fill handle: `source` rows' values (by field id) continued over `targets` (top to bottom), field by field. */
export function fillPlan(a: {
  source: { values: Record<string, unknown> }[]
  targets: { id: string }[]
  fields: TableField[]
  writable: Writable
  up?: boolean
  /** Ctrl+D: the sources copied as they are, not continued. */
  copy?: boolean
}): PlannedWrite {
  const { write, readOnly } = split(a.fields, a.writable)
  const filled = write.map((f) => fillSeries(a.source.map((r) => r.values[f.id] ?? null), a.targets.length, { kind: f.type, up: a.up, copy: a.copy }))
  const input: BatchInput = { kind: "fill" }
  if (write.length && a.targets.length) {
    input.patch = a.targets.map((t, i) => ({ row: t.id, values: Object.fromEntries(write.map((f, c) => [f.id, filled[c][i]])) }))
  }
  return { input, cells: write.length * a.targets.length, readOnly }
}

/** Delete on a range: every writable cell of `rows` in `fields` emptied. */
export function clearPlan(a: { rows: { id: string }[]; fields: TableField[]; writable: Writable }): PlannedWrite {
  const { write, readOnly } = split(a.fields, a.writable)
  const input: BatchInput = { kind: "edit" }
  if (write.length && a.rows.length) input.patch = a.rows.map((r) => ({ row: r.id, values: Object.fromEntries(write.map((f) => [f.id, null])) }))
  return { input, cells: write.length * a.rows.length, readOnly }
}

/** One refused cell of a batch, as the server says it (business/DataTable BatchError): a row, or a new row by its place. */
export interface Refused {
  row?: string
  index?: number
  field?: string
  msg: string
}

/** A refused create's row: the server's zero id (BatchError's row is never left out). */
const NO_ROW = "00000000-0000-0000-0000-000000000000"

/** A refused cell's row id, when it names an existing row. */
const rowOf = (r: Refused): string | null => (r.row && r.row !== NO_ROW ? r.row : null)

/** A refused batch's cells, from its failure (400 with errors), or null for any other failure. */
export function refusedCells(err: unknown): Refused[] | null {
  const res = (err as { response?: { status?: number; data?: { errors?: unknown } } } | null)?.response
  if (res?.status !== 400 || !Array.isArray(res.data?.errors)) return null
  const out = res.data.errors.filter((e): e is Refused => !!e && typeof e === "object" && typeof (e as Refused).msg === "string")
  return out.length ? out : null
}

/** The fields refused per row or per new row; "" when a refusal names no field (the whole row). */
function refusedBy(refused: Refused[]) {
  const rows = new Map<string, Set<string>>()
  const created = new Map<number, Set<string>>()
  const add = <K>(m: Map<K, Set<string>>, k: K, field?: string) => m.set(k, (m.get(k) ?? new Set<string>()).add(field ?? ""))
  for (const r of refused) {
    const row = rowOf(r)
    if (row) add(rows, row, r.field)
    else if (typeof r.index === "number") add(created, r.index, r.field)
  }
  return { rows, created }
}

/** A row's values without its refused fields, or null when nothing of it is left to write. */
function kept(values: Record<string, unknown>, out: Set<string> | undefined, isNew: boolean): Record<string, unknown> | null {
  if (!out) return values
  if (out.has("")) return null
  const left = Object.fromEntries(Object.entries(values).filter(([id]) => !out.has(id)))
  const any = isNew ? Object.values(left).some((v) => v !== null && v !== "") : Object.keys(left).length > 0
  return any ? left : null
}

/** The batch without its refused cells ("Paste the rest"): a row left with nothing written is dropped. */
export function withoutRefused(input: BatchInput, refused: Refused[]): BatchInput {
  const by = refusedBy(refused)
  const out: BatchInput = { kind: input.kind }
  if (input.at) out.at = input.at
  const patch = (input.patch ?? []).flatMap((p) => {
    const values = kept(p.values, by.rows.get(p.row), false)
    return values ? [{ ...p, values }] : []
  })
  const create = (input.create ?? []).flatMap((c, i) => {
    const values = kept(c.values, by.created.get(i), true)
    return values ? [{ ...c, values }] : []
  })
  if (patch.length) out.patch = patch
  if (create.length) out.create = create
  if (input.delete?.length) out.delete = input.delete
  return out
}

/** Each refused cell said: "Row 5, Amount: why", by its row's place in the view (0-based from placeOf). */
export function refusalLines(refused: Refused[], a: { fields: TableField[]; placeOf: (row: string) => number | null }): string[] {
  return refused.map((r) => {
    const row = rowOf(r)
    const place = row ? a.placeOf(row) : null
    const where = place !== null ? `Row ${place + 1}` : !row && typeof r.index === "number" ? `New row ${r.index + 1}` : "A row"
    const field = r.field ? a.fields.find((f) => f.id === r.field)?.name : undefined
    return field ? `${where}, ${field}: ${r.msg}` : `${where}: ${r.msg}`
  })
}

/** How many cells a batch writes. */
export function batchCells(input: BatchInput): number {
  const count = (rows?: { values: Record<string, unknown> }[]) => (rows ?? []).reduce((n, r) => n + Object.keys(r.values).length, 0)
  return count(input.patch) + count(input.create)
}
