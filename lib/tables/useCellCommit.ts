"use client"

import * as React from "react"
import type { AxiosError } from "axios"
import { changeLinks, parseRowValues, patchRow, type TableRow } from "@/services/tableService"

type RowValues = Record<string, unknown>

/** How long the grid waits after an edit before asking for the row again. */
const REFRESH_AFTER_EDIT_MS = 600

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

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
 * value again was never sent. Once a burst of edits settles, the rows edited
 * are asked for again: a formula in them may have changed.
 */
export function useCellCommit({
  tableId,
  rows,
  onChange,
  onSaving,
}: {
  tableId: string
  rows: TableRow[]
  /** Asks for the table again; given a row, only as far as that row needs. */
  onChange: (rowId?: string) => void
  /** How many saves are in flight, as it changes (for a save dot). */
  onSaving?: (inFlight: number) => void
}) {
  const latest = React.useRef({ tableId, onChange, onSaving })
  latest.current = { tableId, onChange, onSaving }
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
  }, [rows])

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

  // The cell already shows the edit; this saves it, and a failed save asks for
  // the row again (the table, when the row is gone), which resets the cell.
  // Resolves false when it failed.
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
      // Forgotten once it resolves, unless a later edit to the cell is on its way.
      const forget = () => {
        const left = pending.current.get(row.id)
        if (left && same(left[fieldId], value)) delete left[fieldId]
        if (left && Object.keys(left).length === 0) pending.current.delete(row.id)
      }
      track(1)
      try {
        await inOrder(row.id, () => patchRow(latest.current.tableId, row.id, { [fieldId]: value }))
        // Saved, unless a later edit to the cell is on its way (it records itself).
        const left = pending.current.get(row.id)
        if (left && fieldId in left && same(left[fieldId], value)) {
          const s = saved.current.get(row.id)
          saved.current.set(row.id, { copy: row.values, edits: { ...(s?.copy === row.values ? s.edits : {}), [fieldId]: value } })
        }
        forget()
        refreshSoon(row.id)
        return true
      } catch (err) {
        forget()
        // The row alone, unless it's gone (404), which only reading the table again shows.
        latest.current.onChange((err as AxiosError)?.response?.status === 404 ? undefined : row.id)
        return false
      } finally {
        track(-1)
      }
    },
    [inOrder, refreshSoon, track],
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

  return React.useMemo(() => ({ commitCell, linkCell }), [commitCell, linkCell])
}

export type CellCommit = ReturnType<typeof useCellCommit>
