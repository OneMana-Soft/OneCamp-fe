import axiosInstance from "@/lib/axiosInstance"
import { TablesPost } from "@/services/endpoints/tables"
import type { TableView, ViewType } from "@/services/tableService"

// A table's saved views (migration 512), written from its views menu, a chunk
// of its own: none of this is the table's first screen.

/** A saved view as it's written: personal makes a new one the reader's own (a view stays whose it is). */
export interface ViewInput {
  name: string
  type: ViewType
  config: Record<string, unknown>
  position: number
  personal?: boolean
}

export async function createView(tableId: string, input: ViewInput): Promise<TableView> {
  const res = await axiosInstance.post(`${TablesPost.TableViews}/${tableId}/views`, input)
  return res.data?.data as TableView
}

export async function updateView(tableId: string, viewId: string, input: ViewInput): Promise<void> {
  await axiosInstance.post(`${TablesPost.TableViews}/${tableId}/views/${viewId}/update`, input)
}

export async function deleteView(tableId: string, viewId: string): Promise<void> {
  await axiosInstance.post(`${TablesPost.TableViews}/${tableId}/views/${viewId}/delete`)
}

/** A manager locks a shared view against change, or unlocks it. */
export async function lockView(tableId: string, viewId: string, locked: boolean): Promise<void> {
  await axiosInstance.post(`${TablesPost.TableViews}/${tableId}/views/${viewId}/lock`, { locked })
}
