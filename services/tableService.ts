import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

// Tables client: a first-class, Notion-style structured-data entity. A table
// has fields (columns), rows, and saved views (grid/board/calendar). All
// mutations are POST (OneCamp router convention); reads use useFetch in
// components. Row writes also broadcast over MQTT for live collaboration.

export type FieldType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "person"
  | "url"
  | "email"
  | "relation"

// A relation cell stores an array of these refs (id + cached label + entity
// type) so the grid renders without resolving each entity on every load.
export interface RelationRef {
  id: string
  label: string
  type: string
}

export type RelationTarget = "task" | "doc" | "board" | "user" | "project" | "any"

export type ViewType = "grid" | "board" | "calendar"
export type Visibility = "private" | "workspace"

export interface TableField {
  id: string
  table_id: string
  name: string
  type: FieldType
  config: string // raw JSON object
  position: number
}

export interface TableRow {
  id: string
  table_id: string
  values: string // raw JSON object keyed by field id
  position: number
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface TableView {
  id: string
  table_id: string
  name: string
  type: ViewType
  config: string // raw JSON object
  position: number
}

export interface DataTable {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  visibility: Visibility
  created_by: string
  created_at: string
  updated_at: string
}

export interface TableBundle {
  table: DataTable
  fields: TableField[]
  views: TableView[]
  rows: TableRow[]
  can_manage: boolean
  mqtt_topic: string
}

// Field select option, stored in field.config.options for select/multi_select.
export interface SelectOption {
  label: string
  color?: string
}

export function parseFieldConfig(f: TableField): { options?: SelectOption[]; [k: string]: unknown } {
  try {
    return JSON.parse(f.config || "{}") || {}
  } catch {
    return {}
  }
}

export function parseRowValues(r: TableRow): Record<string, unknown> {
  try {
    return JSON.parse(r.values || "{}") || {}
  } catch {
    return {}
  }
}

export function parseViewConfig(v: TableView): Record<string, unknown> {
  try {
    return JSON.parse(v.config || "{}") || {}
  } catch {
    return {}
  }
}

// ───────────── tables ─────────────

export async function createTable(input: {
  name: string
  description?: string
  icon?: string
  visibility?: Visibility
}): Promise<DataTable> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateTable, input)
  return res.data?.data as DataTable
}

export async function updateTable(
  id: string,
  input: { name: string; description?: string; icon?: string; visibility?: Visibility },
): Promise<DataTable> {
  const res = await axiosInstance.post(`${PostEndpointUrl.UpdateTable}/${id}/update`, input)
  return res.data?.data as DataTable
}

export async function deleteTable(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTable}/${id}/delete`)
}

// generateTable builds a full table (typed columns + seed rows) from a
// natural-language prompt, server-side via AI, and returns it.
export async function generateTable(prompt: string): Promise<DataTable> {
  const res = await axiosInstance.post(PostEndpointUrl.GenerateTable, { prompt })
  return res.data?.data as DataTable
}

// ───────────── rows ─────────────

export async function createRow(
  tableId: string,
  values: Record<string, unknown>,
  position = 0,
): Promise<TableRow> {
  const res = await axiosInstance.post(`${PostEndpointUrl.CreateTableRow}/${tableId}/rows`, {
    values,
    position,
  })
  return res.data?.data as TableRow
}

export async function updateRow(
  tableId: string,
  rowId: string,
  values: Record<string, unknown>,
  position = 0,
): Promise<TableRow> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.UpdateTableRow}/${tableId}/rows/${rowId}/update`,
    { values, position },
  )
  return res.data?.data as TableRow
}

export async function deleteRow(tableId: string, rowId: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTableRow}/${tableId}/rows/${rowId}/delete`)
}

// ───────────── fields ─────────────

export async function createField(
  tableId: string,
  input: { name: string; type: FieldType; config?: Record<string, unknown>; position?: number },
): Promise<TableField> {
  const res = await axiosInstance.post(`${PostEndpointUrl.CreateTableField}/${tableId}/fields`, input)
  return res.data?.data as TableField
}

export async function updateField(
  tableId: string,
  fieldId: string,
  input: { name: string; type: FieldType; config?: Record<string, unknown>; position?: number },
): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.UpdateTableField}/${tableId}/fields/${fieldId}/update`,
    input,
  )
}

export async function deleteField(tableId: string, fieldId: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTableField}/${tableId}/fields/${fieldId}/delete`)
}

// ───────────── views ─────────────

export async function createView(
  tableId: string,
  input: { name: string; type: ViewType; config?: Record<string, unknown>; position?: number },
): Promise<TableView> {
  const res = await axiosInstance.post(`${PostEndpointUrl.CreateTableView}/${tableId}/views`, input)
  return res.data?.data as TableView
}

export async function updateView(
  tableId: string,
  viewId: string,
  input: { name: string; type: ViewType; config?: Record<string, unknown>; position?: number },
): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.UpdateTableView}/${tableId}/views/${viewId}/update`,
    input,
  )
}

export async function deleteView(tableId: string, viewId: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTableView}/${tableId}/views/${viewId}/delete`)
}
