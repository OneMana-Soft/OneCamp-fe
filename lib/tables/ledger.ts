/**
 * The row ledger on the web (tables A2, PROGRAM.md §4.2 #62): every write to a
 * table's rows is a change set on the server, which a person undoes and redoes,
 * which a row's history reads, and whose deletes wait in the trash. These are
 * its calls, and what the page says of them.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { TablesGet, TablesPost } from "@/services/endpoints/tables"
import type { DataTable, TableField, TableRow } from "@/services/tableService"
import type { ActorKind, ChangeKind } from "@/lib/tables/types"

/** The most rows one batch writes. */
export const BATCH_MAX = 1000

/** Where rows go: after a row, or before one; with neither, after the last. */
export interface RowPlace {
  after?: string
  before?: string
}

/** A batch of writes to a table's rows: one change set, one Undo. */
export interface BatchInput {
  create?: { values: Record<string, unknown> }[]
  at?: RowPlace
  patch?: { row: string; values: Record<string, unknown>; version?: number }[]
  delete?: string[]
  /** What the writer did, for the history: a paste, a fill. */
  kind?: "paste" | "fill" | "import" | "edit"
}

/** What a batch wrote. */
export interface BatchResult {
  change_set: string
  created: TableRow[]
  updated: TableRow[]
  deleted: string[]
}

export async function batchRows(tableId: string, input: BatchInput): Promise<BatchResult> {
  const res = await axiosInstance.post(`${TablesPost.BatchTableRows}/${tableId}/rows/batch`, input)
  return res.data?.data as BatchResult
}

/** Moves rows next to another, in the order given: one change set. */
export async function moveRows(tableId: string, rows: string[], at: RowPlace): Promise<string> {
  const res = await axiosInstance.post(`${TablesPost.MoveTableRows}/${tableId}/rows/move`, { rows, ...at })
  return (res.data?.data?.change_set as string) ?? ""
}

/** What an undo or a redo did. */
export interface UndoResult {
  change_set: string
  reversed: string
  kind: ChangeKind
  changes: number
  skipped: number
}

/** Undoes one of the reader's own changes on a table: the one named, or their latest. */
export async function undoChange(tableId: string, changeSet?: string): Promise<UndoResult> {
  const res = await axiosInstance.post(`${TablesPost.UndoTableChange}/${tableId}/undo`, changeSet ? { change_set: changeSet } : {}, OWN_ERRORS)
  return res.data?.data as UndoResult
}

/** Redoes the reader's latest undo on a table. */
export async function redoChange(tableId: string): Promise<UndoResult> {
  const res = await axiosInstance.post(`${TablesPost.RedoTableChange}/${tableId}/redo`, {}, OWN_ERRORS)
  return res.data?.data as UndoResult
}

/** One change a change set made to a row, as its history shows it. */
export interface HistoryChange {
  field?: string
  event?: "created" | "deleted" | "restored" | "moved" | "links"
  before?: unknown
  after?: unknown
}

/** One change set in a row's history. */
export interface HistoryItem {
  change_set: string
  kind: ChangeKind
  actor_kind: ActorKind
  actor_id?: string
  actor_name?: string
  at: string
  undone?: boolean
  changes: HistoryChange[]
}

export interface RowHistory {
  items: HistoryItem[]
  more: boolean
}

export async function readRowHistory(tableId: string, rowId: string, before?: string): Promise<RowHistory> {
  const q = before ? `?before=${encodeURIComponent(before)}` : ""
  const res = await axiosInstance.get(`${TablesGet.GetTableRowHistory}/${tableId}/rows/${rowId}/history${q}`, OWN_ERRORS)
  return (res.data?.data as RowHistory) ?? { items: [], more: false }
}

/** A row in its table's trash. */
export interface TrashRow {
  id: string
  values: Record<string, unknown>
  row_no?: number
  deleted_at: string
  deleted_by?: string
  deleted_by_name?: string
}

/** A field in its table's trash. */
export interface TrashField {
  field: TableField
  deleted_by?: string
  deleted_by_name?: string
}

export interface TableTrash {
  rows: TrashRow[]
  more: boolean
  fields: TrashField[]
}

export async function readTableTrash(tableId: string, before?: string): Promise<TableTrash> {
  const q = before ? `?before=${encodeURIComponent(before)}` : ""
  const res = await axiosInstance.get(`${TablesGet.GetTableTrash}/${tableId}/trash${q}`, OWN_ERRORS)
  return (res.data?.data as TableTrash) ?? { rows: [], more: false, fields: [] }
}

/** Brings rows (one change set) and fields back from a table's trash. */
export async function restoreFromTrash(tableId: string, what: { rows?: string[]; fields?: string[] }): Promise<{ change_set?: string }> {
  const res = await axiosInstance.post(`${TablesPost.RestoreTableTrash}/${tableId}/trash/restore`, { rows: what.rows ?? [], fields: what.fields ?? [] })
  return (res.data?.data as { change_set?: string }) ?? {}
}

/** A deleted table, as the tables' trash lists it. */
export interface TrashTable {
  table: DataTable & { deleted_at?: string }
  deleted_by?: string
  deleted_by_name?: string
}

export async function readTablesTrash(): Promise<TrashTable[]> {
  const res = await axiosInstance.get(TablesGet.GetTablesTrash, OWN_ERRORS)
  return (res.data?.data as TrashTable[] | null) ?? []
}

export async function restoreTable(tableId: string): Promise<DataTable> {
  const res = await axiosInstance.post(`${TablesPost.RestoreTable}/${tableId}/restore`, {})
  return res.data?.data as DataTable
}

/** "1 row", "12 rows". Pure. */
export function rowsText(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "row" : "rows"}`
}

/** What an undo's or a redo's toast says, and what it left. Pure. */
export function undoneNote(r: UndoResult, redo = false): { title: string; description?: string } {
  const title = redo ? "Redone" : "Undone"
  if (!r.skipped) return { title }
  const one = r.skipped === 1
  return { title, description: `${r.skipped.toLocaleString()} ${one ? "change was left as it is: it" : "changes were left as they are: they"} changed again since.` }
}
