/**
 * A write of many cells at once (a paste, a fill, a clear) through the grid's
 * one edit record (useCellCommit, V-360). It lives in the range's piece, off
 * the table's first load: only a range writes it, and the piece is in by then.
 * So it imports types only, and the record hands it its state (cells).
 */
import type { BatchResult } from "@/lib/tables/ledger"
import type { UndoOrder } from "@/lib/tables/undoOrder"
import type { TableRow } from "@/services/tableService"
import { READ_ONLY_WORDS } from "@/lib/tables/readOnlyWords"

type RowValues = Record<string, unknown>

/** How long a write's added rows stay drawn after its answer, at most: a window view may sort the rows made out of sight. */
const ADDING_HELD_MS = 5_000

/** A row a write adds, on its way: its cells as they will read, under a key of its own until the server names it. */
export interface AddingRow {
  key: string
  values: RowValues
}

/** A write's added rows, and once it's answered, the ids the server made them under. */
export interface Adds {
  write: number
  rows: AddingRow[]
  made?: string[]
}

/** Cells written as one: one batch, one change set. */
export interface CellsWrite {
  /** What it is, for an Undo that finds it wasn't saved ("That fill wasn't saved"). */
  what: string
  /** Each row's cells it writes, as they will read, with the row as it was drawn (its copy). */
  cells: { row: TableRow; values: RowValues }[]
  /** The rows it adds, as they will read: drawn after the last row until the rows its answer made are read. */
  adding?: RowValues[]
  send: () => Promise<BatchResult>
}

/** The edit record's state a write of cells works on (useCellCommit's cells). */
export interface CellsRecord {
  latest: { readonly current: { canEdit: boolean; undos: UndoOrder } }
  /** Each row's cells on their way. */
  pending: Map<string, RowValues>
  /** Each row's cells saved since its copy was read (that copy's values). */
  saved: Map<string, { copy: string; edits: RowValues }>
  /** How many writes each row has on its way. */
  writes: Map<string, number>
  inOrder: <T>(rowIds: string[], send: () => Promise<T>) => Promise<T>
  track: (by: number) => void
  publish: () => void
  setAdds: (next: (was: readonly Adds[]) => readonly Adds[]) => void
  /** Cleared when the grid goes. */
  timers: Set<ReturnType<typeof setTimeout>>
  same: (a: unknown, b: unknown) => boolean
}

let writeSeq = 0

/**
 * Shows the cells at once as saving (a paste's new rows too), in order with
 * each row's writes. Saved, they stay over the copies until read again;
 * refused, they go back and it rejects for the caller to say why. An Undo
 * pressed on its way takes it: they go back at once and it resolves `undone`.
 */
export async function writeCells(r: CellsRecord, write: CellsWrite): Promise<{ answer: BatchResult; undone: boolean }> {
  const { canEdit, undos } = r.latest.current
  if (!canEdit) throw new Error(READ_ONLY_WORDS)
  const { pending, saved, writes, same } = r
  const key = ++writeSeq
  const dropAdds = () => r.setAdds((a) => (a.some((x) => x.write === key) ? a.filter((x) => x.write !== key) : a))
  for (const { row, values } of write.cells) pending.set(row.id, { ...pending.get(row.id), ...values })
  if (write.adding?.length) r.setAdds((a) => [...a, { write: key, rows: write.adding!.map((values, i) => ({ key: `${key}.${i}`, values })) }])
  r.publish()
  // Forgotten once answered, or taken by an Undo: each cell, unless a later edit to it is on its way.
  const forget = () => {
    for (const { row, values } of write.cells) {
      const left = pending.get(row.id)
      if (!left) continue
      for (const [k, v] of Object.entries(values)) if (k in left && same(left[k], v)) delete left[k]
      if (Object.keys(left).length === 0) pending.delete(row.id)
    }
    r.publish()
  }
  const ids = [...new Set(write.cells.map((c) => c.row.id))]
  const nths = ids.map((id) => {
    const nth = (writes.get(id) ?? 0) + 1
    writes.set(id, nth)
    return [id, nth] as const
  })
  r.track(1)
  const free = undos.ready()
  try {
    const going = r.inOrder(ids, free ? () => free.then(write.send) : write.send)
    // Its answer names the batch's change set (null when it changed nothing): an Undo on its way takes that.
    const made = undos.made(write.what, going, () => {
      forget()
      dropAdds()
    })
    const answer = await going
    if (made.taken()) return { answer, undone: true }
    // Saved over each row's copy, unless a later edit to the cell is on its way.
    for (const { row, values } of write.cells) {
      const left = pending.get(row.id)
      const kept = Object.entries(values).filter(([k, v]) => left && k in left && same(left[k], v))
      if (!kept.length) continue
      const s = saved.get(row.id)
      saved.set(row.id, { copy: row.values, edits: { ...(s?.copy === row.values ? s.edits : {}), ...Object.fromEntries(kept) } })
    }
    forget()
    if (write.adding?.length) {
      const created = (answer?.created ?? []).flatMap((x) => (x?.id ? [x.id] : []))
      r.setAdds((a) => a.map((x) => (x.write === key ? { ...x, made: created } : x)))
      const t = setTimeout(() => {
        r.timers.delete(t)
        dropAdds()
      }, ADDING_HELD_MS)
      r.timers.add(t)
    }
    return { answer, undone: false }
  } catch (e) {
    forget()
    dropAdds()
    throw e
  } finally {
    for (const [id, nth] of nths) if (writes.get(id) === nth) writes.delete(id)
    r.track(-1)
  }
}
