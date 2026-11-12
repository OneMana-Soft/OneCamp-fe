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
  /** What it is, for an Undo that finds it wasn't saved or changed nothing ("That fill wasn't saved", "That fill changed nothing"). */
  what: string
  /** Each row's cells it writes, as they will read, with the row as it was drawn (its copy). */
  cells: { row: TableRow; values: RowValues }[]
  /** The rows it adds, as they will read: drawn after the last row until the rows its answer made are read. */
  adding?: RowValues[]
  send: () => Promise<BatchResult>
  /**
   * The same write again, of only the cells given (those it keeps, as they
   * were) and its new rows when `adds`: a Retry's, the person's own, once the
   * server asked to have it again later (503, V-617); null when that was
   * refused or failed. Without it, such a write's cells go back as any refused
   * one's do.
   */
  again?: (cells: CellsWrite["cells"], adds: boolean) => Promise<unknown>
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
  /** Each row's cells kept from a write the server asked to have again later (503), as they were. */
  unsaved: Map<string, RowValues>
  /** Takes a row's cells out of those kept (unsaved): a write of them takes their place. */
  take: (rowId: string, fields: string[]) => boolean
  /**
   * A write the server asked to have again later (503), its cells kept and
   * said once with Retry, `send` (useCellCommit's keep), resolving to its
   * toast; false for any other failure. A note is the toast's words, and keeps
   * it until the person acts.
   */
  keep: (err: unknown, cells: CellsWrite["cells"], send: () => unknown, note?: string) => false | Promise<{ dismiss: () => void }>
  /** Whether a failed write was said already (with a Retry, by keep): its caller says no more. */
  said: (err: unknown) => boolean
  /** The range writes kept for a 503, newest first: their cells' marks reach them (retryCell, RowEdits' named). */
  wholes: KeptWrite[]
}

/** A range write kept for a 503 (V-617), as its toast and every mark of it reach it (DESIGN-BUILD-129's F1b). */
export interface KeptWrite {
  /** What a mark of a cell it still keeps sends, named ("the paste: 2 cells and 1 new row"); undefined for any other cell. */
  name: (rowId: string, field: string) => string | undefined
  /** Its Retry, the person's own: one write of the cells still kept and, the first time, its new rows; false when that failed. */
  send: () => Promise<boolean>
}

const counted = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`

let writeSeq = 0

/**
 * Shows the cells at once as saving (a paste's new rows too), in order with
 * each row's writes. Saved, they stay over the copies until read again;
 * refused, they go back and it rejects for the caller to say why. Asked to
 * have again later (503: nothing of it was stored), they're kept, marked, and
 * the write is offered back once with Retry (its `again`), said there: it
 * rejects with that failure said (wasSaid), never sent again by itself
 * (V-617). An Undo pressed on its way takes it: they go back at once and it
 * resolves `undone`.
 */
export async function writeCells(r: CellsRecord, write: CellsWrite): Promise<{ answer: BatchResult; undone: boolean }> {
  const { canEdit, undos } = r.latest.current
  if (!canEdit) throw new Error(READ_ONLY_WORDS)
  const { pending, saved, writes, same } = r
  const key = ++writeSeq
  const dropAdds = () => r.setAdds((a) => (a.some((x) => x.write === key) ? a.filter((x) => x.write !== key) : a))
  // Each cell it writes takes the place of one kept from a write the server asked to have again (its Retry's too).
  for (const { row, values } of write.cells) {
    r.take(row.id, Object.keys(values))
    pending.set(row.id, { ...pending.get(row.id), ...values })
  }
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
  let made: { taken: () => boolean } | undefined
  try {
    const going = r.inOrder(ids, free ? () => free.then(write.send) : write.send)
    // Its answer names the batch's change set (null when it changed nothing): an Undo on its way takes that.
    made = undos.made(write.what, going, () => {
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
    // Asked to have again later (503), unless an Undo took it on its way: its
    // cells kept and the write offered back once, from its toast and from every
    // mark of it alike (DESIGN-BUILD-129's F1b). Its Retry sends the cells
    // still kept as they were (none changed since, nothing for a reader who
    // may now only view) and its new rows the first time, as one write: the
    // paste lands whole or not at all, even once its toast has gone. Its new
    // rows are drawn nowhere until then, so its toast stays until the person
    // acts, saying how many (F1a, G2).
    const again = write.again
    if (again && !made?.taken()) {
      const n = write.adding?.length ?? 0
      let rows = n > 0
      const still = () =>
        write.cells.flatMap(({ row, values }) => {
          const now = r.unsaved.get(row.id)
          const left = Object.entries(values).filter(([k, v]) => now && k in now && same(now[k], v))
          return left.length ? [{ row, values: Object.fromEntries(left) }] : []
        })
      let offered: ReturnType<CellsRecord["keep"]> = false
      const whole: KeptWrite = {
        name: (rowId, field) => {
          const kept = still()
          if (!kept.some((c) => c.row.id === rowId && field in c.values)) return undefined
          const cells = kept.reduce((sum, c) => sum + Object.keys(c.values).length, 0)
          return `the ${write.what}: ${counted(cells, "cell")}${rows ? ` and ${counted(n, "new row")}` : ""}`
        },
        send: async () => {
          if (!r.latest.current.canEdit) return true
          const cells = still()
          const withRows = rows
          rows = false
          const at = r.wholes.indexOf(whole)
          if (at >= 0) r.wholes.splice(at, 1)
          // Pressed on a mark, its toast goes too: nothing is left for it to send.
          void (offered && offered.then((t) => t.dismiss()))
          return cells.length || withRows ? (await again(cells, withRows)) !== null : true
        },
      }
      // Reached by the marks as keep draws them.
      r.wholes.unshift(whole)
      offered = r.keep(e, write.cells, whole.send, n ? `${counted(n, "new row")} ${n === 1 ? "wasn't" : "weren't"} added. Try again in a moment.` : "")
      if (!offered) r.wholes.shift()
    }
    throw e
  } finally {
    for (const [id, nth] of nths) if (writes.get(id) === nth) writes.delete(id)
    r.track(-1)
  }
}
