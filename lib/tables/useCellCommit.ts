"use client"

import * as React from "react"
import type { AxiosError } from "axios"
import { changeLinks, parseRowValues, patchRow, type TableRow } from "@/services/tableService"
import { refusedAsViewer } from "@/lib/tables/tableEdit"
import { UndoOrder, type Aim } from "@/lib/tables/undoOrder"
import type { AddingRow, Adds, CellsRecord } from "@/lib/tables/cellsWrite"
import { reloadForNewBuild } from "@/lib/newBuild"

type RowValues = Record<string, unknown>

/** The ledger, its own chunk, as the table's undos and range writes read it; gone after a deploy, the page reloads for the new build. */
export const ledger = () =>
  import("@/lib/tables/ledger").catch(async (e: unknown) => {
    if (await reloadForNewBuild(e)) return new Promise<never>(() => undefined)
    throw e
  })

/** How long the grid waits after an edit before asking for the row again. */
const REFRESH_AFTER_EDIT_MS = 600

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A row's edits its copy doesn't show yet: those on their way (saving), and
 * those saved over the copy they were made on (saved, on copy), until the
 * row is read again.
 */
export interface RowEdits {
  saving: RowValues
  saved: RowValues
  copy: string | null
}
const NO_EDITS: ReadonlyMap<string, RowEdits> = new Map()

/** A row's values as its cells show them: its copy, under the edits it doesn't show yet. */
export function shownValues(row: TableRow, edits?: RowEdits): RowValues {
  const values = parseRowValues(row)
  return edits ? { ...values, ...(edits.copy === row.values ? edits.saved : {}), ...edits.saving } : values
}

/**
 * Saving a cell, shared by the grid and the record panel so both go through
 * one path and one record of edits in flight (content.md T15).
 *
 * An edit sends its cell alone (patchRow), so it can't put back what someone
 * else wrote in the row after this reader's copy was read: a whole row sent
 * from that copy did, and the other person's edit was lost. A row's edits go
 * out one after another, so the last one made is the one kept. The edits on
 * their way are remembered only so that one undoing another (back to what the
 * copy says) is still sent; a saved one only until the row's copy is read
 * again, whatever it then says: kept until the copy showed the same value, a
 * value someone else wrote meanwhile kept it for ever, and picking the earlier
 * value again was never sent. The answer to a row's last write, the row as a
 * read gives it, goes to onSaved (tables A7); without it, the rows edited are
 * asked for again.
 *
 * Until a row is read again, its cells show its copy under these edits
 * (edits, shownValues), those on their way as saving, and a failed one goes
 * back to the copy: a cell left at rest drew the copy's old value until the
 * save answered (REGRESSION-HUNT-1, 26 Oct).
 * A range's write goes through it too (cellsWrite), and each write enters the
 * table's undo order when made (V-360).
 */
export function useCellCommit({
  tableId,
  rows,
  onChange,
  onSaving,
  onSaved,
  canEdit = true,
}: {
  tableId: string
  rows: TableRow[]
  /** Whether the reader edits the table's rows (V-170): a cell's write or link by one who may only view it is never sent. */
  canEdit?: boolean
  /** Asks for the table again; given a row, only as far as that row needs. */
  onChange: (rowId?: string) => void
  /** A saved row as its save answered it (useTableRows' put). */
  onSaved?: (row: TableRow) => void
  /** How many saves are in flight, as it changes (for a save dot). */
  onSaving?: (inFlight: number) => void
}) {
  // One undo order a table.
  const order = React.useRef<{ tableId: string; undos: UndoOrder } | null>(null)
  if (order.current?.tableId !== tableId) order.current = { tableId, undos: new UndoOrder() }
  const { undos } = order.current
  const latest = React.useRef({ tableId, onChange, onSaving, onSaved, canEdit, undos })
  latest.current = { tableId, onChange, onSaving, onSaved, canEdit, undos }
  const inFlight = React.useRef(0)
  const track = React.useCallback((by: number) => {
    inFlight.current += by
    latest.current.onSaving?.(inFlight.current)
  }, [])

  const edited = React.useRef(new Set<string>())
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshSoon = React.useCallback((rowId: string) => {
    edited.current.add(rowId)
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      const ids = [...edited.current]
      edited.current.clear()
      for (const id of ids) latest.current.onChange(id)
    }, REFRESH_AFTER_EDIT_MS)
  }, [])
  React.useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    [],
  )

  // Edits on their way, and edits saved since the row's copy was read (the
  // copy's values then): what a cell holds until the copy is read again.
  const pending = React.useRef(new Map<string, RowValues>())
  const saved = React.useRef(new Map<string, { copy: string; edits: RowValues }>())
  // Both, as state the cells draw from. A row's entry keeps its identity while
  // it holds the same, so only the rows whose edits changed draw again.
  const [shown, setShown] = React.useState(NO_EDITS)
  const publish = React.useCallback(() => {
    setShown((was) => {
      const next = new Map<string, RowEdits>()
      let changed = false
      for (const id of new Set([...pending.current.keys(), ...saved.current.keys()])) {
        const s = saved.current.get(id)
        const e: RowEdits = { saving: { ...pending.current.get(id) }, saved: { ...s?.edits }, copy: s?.copy ?? null }
        const before = was.get(id)
        next.set(id, before && same(before, e) ? before : e)
        changed ||= next.get(id) !== before
      }
      return changed || next.size !== was.size ? next : was
    })
  }, [])
  React.useEffect(() => {
    for (const [id, edits] of pending.current) {
      const r = rows.find((x) => x.id === id)
      if (!r) continue
      const now = parseRowValues(r)
      for (const k of Object.keys(edits)) if (same(now[k], edits[k])) delete edits[k]
      if (Object.keys(edits).length === 0) pending.current.delete(id)
    }
    for (const [id, s] of saved.current) {
      const r = rows.find((x) => x.id === id)
      if (r && r.values !== s.copy) saved.current.delete(id)
    }
    publish()
  }, [rows, publish])

  // Each row's last write on its way: the next waits for it, saved or not.
  const queued = React.useRef(new Map<string, Promise<unknown>>())
  const inOrder = React.useCallback(<T,>(rowIds: string[], send: () => Promise<T>): Promise<T> => {
    const before = rowIds.flatMap((id) => queued.current.get(id) ?? [])
    const mine = before.length === 0 ? send() : (before.length === 1 ? before[0] : Promise.all(before)).then(send)
    const done = mine.catch(() => undefined)
    for (const id of rowIds) queued.current.set(id, done)
    void done.then(() => {
      for (const id of rowIds) if (queued.current.get(id) === done) queued.current.delete(id)
    })
    return mine
  }, [])
  // How many writes each row with one on its way has had: only the last one's
  // answer is the row as it now is. An earlier answer put back would show a
  // cell a later write changes as it was (a tick, then an untick made before
  // the tick was saved, showed ticked again until the untick's answer came).
  const writes = React.useRef(new Map<string, number>())

  // The cell shows the edit at once, as saving (edits); this saves it. A failed
  // save drops it, so the cell goes back to the copy, and asks for the row
  // again (the table, when the row is gone). Resolves false when it failed.
  // Takes the row it was rendered with, so an edit still saves when its row
  // has left the page (scrolled out, or filtered out by the edit itself). An
  // Undo pressed on its way takes it: the cell goes back at once.
  const commitCell = React.useCallback(
    async (row: TableRow, fieldId: string, value: unknown): Promise<boolean> => {
      if (!latest.current.canEdit) return false
      const edits = pending.current.get(row.id) ?? {}
      const done = saved.current.get(row.id)
      const current =
        fieldId in edits ? edits[fieldId] : done?.copy === row.values && fieldId in done.edits ? done.edits[fieldId] : parseRowValues(row)[fieldId]
      if (same(current, value)) return true
      pending.current.set(row.id, { ...edits, [fieldId]: value })
      publish()
      // Forgotten once it resolves, unless a later edit to the cell is on its way.
      const forget = () => {
        const left = pending.current.get(row.id)
        if (left && same(left[fieldId], value)) delete left[fieldId]
        if (left && Object.keys(left).length === 0) pending.current.delete(row.id)
        publish()
      }
      const nth = (writes.current.get(row.id) ?? 0) + 1
      writes.current.set(row.id, nth)
      track(1)
      const { undos } = latest.current
      const free = undos.ready()
      const send = () => patchRow(latest.current.tableId, row.id, { [fieldId]: value })
      try {
        const going = inOrder([row.id], free ? () => free.then(send) : send)
        // Its answer names the change set it stored (V-360): an Undo on its way takes that.
        const made = undos.made("edit", going, forget)
        const answered = await going
        if (made.taken()) return true
        // Saved, unless a later edit to the cell is on its way (it records itself).
        const left = pending.current.get(row.id)
        if (left && fieldId in left && same(left[fieldId], value)) {
          const s = saved.current.get(row.id)
          saved.current.set(row.id, { copy: row.values, edits: { ...(s?.copy === row.values ? s.edits : {}), [fieldId]: value } })
        }
        forget()
        if (writes.current.get(row.id) !== nth) return true
        const put = latest.current.onSaved
        if (put && answered?.id === row.id) put(answered)
        else refreshSoon(row.id)
        return true
      } catch (err) {
        forget()
        // The row alone, unless it's gone (404) or its writer may now only view
        // the table (V-170), which only reading the table again shows.
        latest.current.onChange((err as AxiosError)?.response?.status === 404 || refusedAsViewer(err) ? undefined : row.id)
        return false
      } finally {
        if (writes.current.get(row.id) === nth) writes.current.delete(row.id)
        track(-1)
      }
    },
    [inOrder, refreshSoon, track, publish],
  )

  const linkCell = React.useCallback(async (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => {
    if (!latest.current.canEdit) return
    try {
      await latest.current.undos.write("change", () => changeLinks(latest.current.tableId, rowId, fieldId, change))
    } catch {
      // surfaced by the interceptor
    } finally {
      latest.current.onChange()
    }
  }, [])

  // The rows writes add, on their way (adding): shown until the rows the
  // answer made are held, or for a few seconds at most (a window view sorts them).
  const [adds, setAdds] = React.useState<readonly Adds[]>(NO_ADDS)
  const addTimers = React.useRef(new Set<ReturnType<typeof setTimeout>>())
  React.useEffect(() => {
    const timers = addTimers.current
    return () => timers.forEach(clearTimeout)
  }, [])
  const adding = React.useMemo(() => {
    if (!adds.length) return NO_ADDING
    const held = new Set(rows.map((r) => r.id))
    const out = adds.filter((x) => !x.made?.every((id) => held.has(id))).flatMap((x) => x.rows)
    return out.length ? out : NO_ADDING
  }, [adds, rows])
  // What a write of many cells works on (cellsWrite): it's in the range's piece, off the first load.
  const cells = React.useMemo<CellsRecord>(
    () => ({ latest, pending: pending.current, saved: saved.current, writes: writes.current, inOrder, track, publish, setAdds, timers: addTimers.current, same }),
    [inOrder, track, publish],
  )

  const press = React.useCallback(<T,>(run: (aim: Aim) => Promise<T>, aims = true): Promise<T> => latest.current.undos.press(run, aims), [])
  // A write of whole rows (an add, a move, a delete, a find's replace) is the reader's to undo too.
  const write = React.useCallback<UndoOrder["write"]>((what, send, setOf, onTaken) => latest.current.undos.write(what, send, setOf, onTaken), [])
  // A change's own Undo (a toast's: a delete, a duplicate, a clean-up, a replace, a range's write), the one path for
  // them all: in the order, after the presses before it, taking nothing on its way.
  const undo = React.useCallback((set: string): Promise<unknown> => press(() => ledger().then((m) => m.undoChange(latest.current.tableId, set)), false), [press])

  return React.useMemo(() => ({ commitCell, cells, linkCell, press, write, undo, edits: shown, adding }), [commitCell, cells, linkCell, press, write, undo, shown, adding])
}

const NO_ADDING: readonly AddingRow[] = []
const NO_ADDS: readonly Adds[] = []

export type CellCommit = ReturnType<typeof useCellCommit>
/** The record panel's part of the edit path. */
export type CellEdits = Pick<CellCommit, "commitCell" | "linkCell" | "write" | "undo" | "edits">
