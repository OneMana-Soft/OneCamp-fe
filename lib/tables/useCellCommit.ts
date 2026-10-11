"use client"

import * as React from "react"
import { changeLinks, parseRowValues, updateRow, writableValues, type TableField, type TableRow } from "@/services/tableService"

type RowValues = Record<string, unknown>

/** How long the grid waits after an edit before asking for the table again. */
const REFRESH_AFTER_EDIT_MS = 600

/**
 * Saving a cell, shared by the grid and the record panel so both go through
 * one path and one record of edits in flight (content.md T15).
 *
 * A row is saved whole (updateRow takes every value), so a second edit made
 * before the table comes back must carry the first one with it, or it would
 * put the old value back. After an edit the table is asked for again (a
 * formula, a rollup or another row may have changed with it), once a burst of
 * edits settles.
 */
export function useCellCommit({
  tableId,
  fields,
  rows,
  onChange,
  onSaving,
}: {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  onChange: () => void
  /** How many saves are in flight, as it changes (for a save dot). */
  onSaving?: (inFlight: number) => void
}) {
  const latest = React.useRef({ fields, tableId, onChange, onSaving })
  latest.current = { fields, tableId, onChange, onSaving }
  const inFlight = React.useRef(0)
  const track = React.useCallback((by: number) => {
    inFlight.current += by
    latest.current.onSaving?.(inFlight.current)
  }, [])

  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => latest.current.onChange(), REFRESH_AFTER_EDIT_MS)
  }, [])
  React.useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    },
    [],
  )

  const pending = React.useRef(new Map<string, RowValues>())
  React.useEffect(() => {
    for (const [id, edits] of pending.current) {
      const r = rows.find((x) => x.id === id)
      if (!r) continue
      const now = parseRowValues(r)
      for (const k of Object.keys(edits)) if (JSON.stringify(now[k]) === JSON.stringify(edits[k])) delete edits[k]
      if (Object.keys(edits).length === 0) pending.current.delete(id)
    }
  }, [rows])

  // The cell already shows the edit; this saves it, and a failed save asks for
  // the table again, which resets the cell. Resolves false when it failed.
  // Takes the row it was rendered with, so an edit still saves when its row
  // has left the page (scrolled out, or filtered out by the edit itself).
  const commitCell = React.useCallback(
    async (row: TableRow, fieldId: string, value: unknown): Promise<boolean> => {
      const { fields, tableId } = latest.current
      const edits = pending.current.get(row.id) ?? {}
      const current = { ...parseRowValues(row), ...edits }
      if (JSON.stringify(current[fieldId]) === JSON.stringify(value)) return true
      pending.current.set(row.id, { ...edits, [fieldId]: value })
      const next: RowValues = writableValues(fields, { ...current, [fieldId]: value })
      track(1)
      try {
        await updateRow(tableId, row.id, next, row.position)
        refreshSoon()
        return true
      } catch {
        const mine = pending.current.get(row.id)
        if (mine) delete mine[fieldId]
        latest.current.onChange()
        return false
      } finally {
        track(-1)
      }
    },
    [refreshSoon, track],
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
