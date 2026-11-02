import axiosInstance from "@/lib/axiosInstance"
import { TablesPost } from "@/services/endpoints/tables"
import type { TableEditing } from "@/services/tableService"

// Who edits a table's rows, as its managers change it (V-170). Only Share's
// Who can edit calls this, so it comes with that lazy dialog, not the table.

/** A manager's change to who edits a table's rows: its general level, people chosen and people no longer chosen. */
export interface TableEditingChange {
  general?: TableEditing["general"]
  add?: string[]
  remove?: string[]
}

/** Changes who edits a table's rows: who does now, as the server keeps it. */
export async function setTableEditing(id: string, change: TableEditingChange): Promise<TableEditing> {
  const res = await axiosInstance.post(`${TablesPost.SetTableEditing}/${id}/editing`, change)
  return res.data?.data as TableEditing
}
