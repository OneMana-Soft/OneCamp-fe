// The grid's column changes (add, save, duplicate, delete): a chunk of their
// own, loaded on a column's first change, off the table's first load (the
// route diet, main 21:52 and 22:4x). DataTableGrid hands each its Columns.

import type { useConfirm } from "@/hooks/useConfirm"
import { restoreFromTrash } from "@/lib/tables/ledger"
import { parseFieldConfig, type TableField } from "@/services/tableService"
import { createField, deleteField, updateField } from "@/services/tableCalls"
import type { ColumnCreateInput, ColumnSaveInput } from "@/components/table/ColumnMenu"

/** The grid's table, and what a column's change tells it. */
export interface Columns {
  tableId: string
  fields: TableField[]
  onChange: () => void
  confirm: ReturnType<typeof useConfirm>
  offerUndo: (title: string, undo: () => void) => void
  /** Opens a column's menu on its name. */
  openMenu: (fieldId: string) => void
}

/**
 * Adds a column after the last; a plain type opens its menu on its name.
 * Resolves whether it was made: one the server refused keeps its form open,
 * with what was typed in it (a formula), as AddColumnBody reads false.
 */
export async function createColumn({ tableId, fields, onChange, openMenu }: Columns, input: ColumnCreateInput): Promise<boolean> {
  const pos = fields.length ? Math.max(...fields.map((f) => f.position)) + 1 : 0
  try {
    const f = await createField(tableId, { name: input.name, type: input.type, position: pos, config: input.config })
    onChange()
    if (f?.id && input.type !== "formula" && input.type !== "relation" && input.type !== "rollup") openMenu(f.id)
    return true
  } catch {
    // surfaced
    return false
  }
}

/**
 * Saves what a column's menu changed, and resolves whether it saved. A save
 * sends what the menu changed and nothing of the page's copy: its place, sent
 * with a rename or an option, put back a column someone had moved meanwhile,
 * and its name a rename.
 */
export async function saveColumn({ tableId, onChange }: Columns, field: TableField, input: ColumnSaveInput): Promise<boolean> {
  try {
    await updateField(tableId, field.id, input)
    return true
  } catch {
    // surfaced
    return false
  } finally {
    onChange()
  }
}

/** Copies a column after the last: its settings, without what a formula or a rollup worked out. */
export async function duplicateColumn({ tableId, fields, onChange }: Columns, field: TableField): Promise<void> {
  const pos = Math.max(...fields.map((f) => f.position)) + 1
  const { result: _r, error: _e, ...cfg } = parseFieldConfig(field) as Record<string, unknown>
  void _r
  void _e
  try {
    await createField(tableId, { name: `${field.name} copy`, type: field.type, position: pos, config: cfg })
    onChange()
  } catch {
    // surfaced
  }
}

/** Deletes a column once confirmed: it's kept in the table's trash with its cells, and one Undo brings it back. */
export function deleteColumn({ tableId, onChange, confirm, offerUndo }: Columns, field: TableField): void {
  confirm({
    title: `Delete the column "${field.name}"?`,
    description: "It's removed for everyone, and kept in the table's trash with its cells.",
    confirmText: "Delete column",
    destructive: true,
    onConfirm: async () => {
      try {
        await deleteField(tableId, field.id)
        onChange()
        offerUndo("Column deleted", () => restoreFromTrash(tableId, { fields: [field.id] }))
      } catch {
        // surfaced
      }
    },
  })
}
