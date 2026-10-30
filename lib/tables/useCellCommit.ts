"use client"

import * as React from "react"
import type { AxiosError } from "axios"
import { changeLinks, parseRowValues, patchRow, type TableRow } from "@/services/tableService"

type RowValues = Record<string, unknown>

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
 */
export function useCellCommit({
  tableId,
  rows,
  onChange,
  onSaving,
  onSaved,
}: {
  tableId: string
  rows: TableRow[]
  /** Asks for the table again; given a row, only as far as that row needs. */
  onChange: (rowId?: string) => void
  /** A saved row as its save answered it (useTableRows' put). */
  onSaved?: (row: TableRow) => void
  /** How many saves are in flight, as it changes (for a save dot). */
  onSaving?: (inFlight: number) => void
}) {
  const latest = React.useRef({ tableId, onChange, onSaving, onSaved })
  latest.current = { tableId, onChange, onSaving, onSaved }
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
  const inOrder = React.useCallback(<T,>(rowId: string, send: () => Promise<T>): Promise<T> => {
    const before = queued.current.get(rowId)
    const mine = before ? before.then(send) : send()
    const done = mine.catch(() => undefined)
    queued.current.set(rowId, done)
    void done.then(() => {
      if (queued.current.get(rowId) === done) queued.current.delete(rowId)
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
  // has left the page (scrolled out, or filtered out by the edit itself).
  const commitCell = React.useCallback(
    async (row: TableRow, fieldId: string, value: unknown): Promise<boolean> => {
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
      try {
        const answered = await inOrder(row.id, () => patchRow(latest.current.tableId, row.id, { [fieldId]: value }))
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
        // The row alone, unless it's gone (404), which only reading the table again shows.
        latest.current.onChange((err as AxiosError)?.response?.status === 404 ? undefined : row.id)
        return false
      } finally {
        if (writes.current.get(row.id) === nth) writes.current.delete(row.id)
        track(-1)
      }
    },
    [inOrder, refreshSoon, track, publish],
  )

  const linkCell = React.useCallback(async (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => {
    try {
      await changeLinks(latest.current.tableId, rowId, fieldId, change)
    } catch {
      // surfaced by the interceptor
    } finally {
      latest.current.onChange()
    }
  }, [])

  return React.useMemo(() => ({ commitCell, linkCell, edits: shown }), [commitCell, linkCell, shown])
}

export type CellCommit = ReturnType<typeof useCellCommit>
