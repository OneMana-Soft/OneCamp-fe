"use client"

/**
 * The bar the grid floats over its rows while some are selected (FloatingBar):
 * how many, Duplicate, Delete and Clear. A chunk of its own (DataTableGrid's
 * SelectionPart), off the table's first screen, warmed when the page is idle
 * or a row's checkbox is reached.
 */

import { Copy, Trash2, X } from "@/lib/icons"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import type { useConfirm } from "@/hooks/useConfirm"
import { batchRows, rowsText, undoChange } from "@/lib/tables/ledger"
import { parseRowValues, writableValues, type TableField, type TableRow } from "@/services/tableService"

/** The rows selected and what the bar's actions do with them: the grid's. */
export interface Selection {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  ids: ReadonlySet<string>
  clear: () => void
  confirm: ReturnType<typeof useConfirm>
  offerUndo: (title: string, undo: () => void) => void
  onChange: () => void
  onCreated?: (rows: TableRow[]) => void
}

/** Deletes the rows selected, once confirmed: one request, one change set, so the whole delete is one Undo, and its rows wait in the table's trash until someone brings them back. */
export function deleteRows({ tableId, ids, clear, confirm, offerUndo, onChange }: Selection) {
  const del = [...ids]
  confirm({
    title: del.length === 1 ? "Delete the selected row?" : `Delete ${del.length} selected rows?`,
    description: del.length === 1 ? "It's removed for everyone, and kept in the table's trash." : "They're removed for everyone, and kept in the table's trash.",
    confirmText: "Delete selected",
    destructive: true,
    onConfirm: async () => {
      try {
        const done = await batchRows(tableId, { delete: del })
        clear()
        offerUndo(del.length === 1 ? "Row deleted" : `${rowsText(del.length)} deleted`, () => undoChange(tableId, done.change_set))
      } catch {
        // surfaced
      } finally {
        onChange()
      }
    },
  })
}

/** Copies the rows selected after every row, in the order shown, in one request: one change set, one Undo. */
export async function duplicateRows({ tableId, fields, rows, ids, clear, offerUndo, onChange, onCreated }: Selection) {
  const picked = rows.filter((r) => ids.has(r.id))
  let made: TableRow[] = []
  try {
    const done = await batchRows(tableId, { create: picked.map((r) => ({ values: writableValues(fields, parseRowValues(r)) })) })
    made = done.created ?? []
    clear()
    offerUndo(picked.length === 1 ? "Row duplicated" : `${rowsText(picked.length)} duplicated`, () => undoChange(tableId, done.change_set))
  } catch {
    // surfaced
  } finally {
    const added = made.filter((r) => r?.id)
    if (onCreated && added.length) onCreated(added)
    else onChange()
  }
}

export function RowSelectionBar({ count, onDuplicate, onDelete, onClear }: { count: number; onDuplicate: () => void; onDelete: () => void; onClear: () => void }) {
  return (
    <FloatingBar label="Selected rows" className="pointer-events-auto" onEscape={onClear}>
      <span className="px-2 text-ui-sm font-medium text-ink">
        {count} {count === 1 ? "row" : "rows"}
      </span>
      <FloatingBarDivider />
      <FloatingBarButton label="Duplicate" onClick={onDuplicate}>
        <Copy className="size-4" />
      </FloatingBarButton>
      <FloatingBarButton label="Delete" onClick={onDelete} className="text-danger-ink">
        <Trash2 className="size-4" />
      </FloatingBarButton>
      <FloatingBarDivider />
      <FloatingBarButton label="Clear the selection" onClick={onClear}>
        <X className="size-4" />
      </FloatingBarButton>
    </FloatingBar>
  )
}
