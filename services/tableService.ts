import axiosInstance from "@/lib/axiosInstance"
import { browserTZ } from "@/lib/utils/timeZone"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

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
  | "formula"

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
  /** The table has more rows than the bundle's first page carries. */
  rows_truncated?: boolean
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

// What a formula field gives, as the server works it out on each read.
export type FormulaResult = "number" | "text" | "date" | "checkbox"

// A formula field's config as the server sends it: the formula with fields by
// name, what it gives, and why it can't be worked out, when it can't.
export function formulaOf(f: TableField): { formula: string; result: FormulaResult; error?: string } {
  const cfg = parseFieldConfig(f)
  const result = cfg.result
  return {
    formula: typeof cfg.formula === "string" ? cfg.formula : "",
    result: result === "number" || result === "date" || result === "checkbox" ? result : "text",
    error: typeof cfg.error === "string" ? cfg.error : undefined,
  }
}

// A table read for this reader: formulas count TODAY() where they are.
function inZone(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}tz=${encodeURIComponent(browserTZ())}`
}

// The key a table's bundle is fetched and cached under.
export function tableBundleKey(tableId: string): string {
  return inZone(`${GetEndpointUrl.GetTable}/${tableId}`)
}

/** Where a new row goes: after every row there is. */
export function nextRowPosition(rows: TableRow[]): number {
  return rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0
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
  const res = await axiosInstance.post(inZone(`${PostEndpointUrl.CreateTableRow}/${tableId}/rows`), {
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
    inZone(`${PostEndpointUrl.UpdateTableRow}/${tableId}/rows/${rowId}/update`),
    { values, position },
  )
  return res.data?.data as TableRow
}

export async function deleteRow(tableId: string, rowId: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTableRow}/${tableId}/rows/${rowId}/delete`)
}

// ───────────── aggregate (chart view / analytics) ─────────────

export type AggregateOp = "count" | "sum" | "avg" | "min" | "max"

type FilterOp =
  | "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty"

// A single row-level predicate. `field` is a column id or name.
interface AggregateFilter {
  field: string
  op: FilterOp
  value?: string
}

// Describes an aggregation. group_by/value_field/filter.field may each be a
// column id or a case-insensitive column name (server resolves either).
interface AggregateQuery {
  group_by?: string
  aggregate?: AggregateOp
  value_field?: string
  filters?: AggregateFilter[]
  limit?: number
  ascending?: boolean
}

export interface AggregateBucket {
  label: string
  value: number
  count: number
}

export interface AggregateResult {
  aggregate: AggregateOp
  group_by: string
  group_by_type?: string
  value_field?: string
  buckets: AggregateBucket[]
  matched_rows: number
  scanned_rows: number
  distinct_groups: number
  truncated: boolean
}

// aggregateTable computes a grouped aggregation over a table's rows server-side
// (permission-scoped, bounded) — the data behind a chart/summary view without
// downloading every row. Reuses the exact engine the AI query_table tool uses.
export async function aggregateTable(
  tableId: string,
  query: AggregateQuery,
): Promise<AggregateResult> {
  const res = await axiosInstance.post(
    inZone(`${PostEndpointUrl.AggregateTable}/${tableId}/aggregate`),
    query,
  )
  return res.data?.data as AggregateResult
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

// A formula being written, checked against the table's fields without saving
// it: what it gives and its values in the first rows, or why it can't be read.
export interface FormulaPreview {
  result: FormulaResult
  error?: string
  values: unknown[]
}

export async function previewFormula(tableId: string, formula: string, fieldId?: string): Promise<FormulaPreview> {
  const res = await axiosInstance.post(inZone(`${PostEndpointUrl.PreviewTableFormula}/${tableId}/formula/preview`), {
    formula,
    field_id: fieldId,
  })
  return res.data?.data as FormulaPreview
}

export async function deleteField(tableId: string, fieldId: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteTableField}/${tableId}/fields/${fieldId}/delete`)
}

// fillTableAIColumn evaluates an AI column's prompt over each row (or the given
// subset) and writes the cells. Returns counts of filled/skipped rows. The fill
// runs server-side through the shared AI service (per-user model, rate limit,
// circuit breaker) and broadcasts each cell over MQTT, so the grid updates live.
export async function fillTableAIColumn(
  tableId: string,
  fieldId: string,
  rowIds?: string[],
): Promise<{ filled: number; skipped: number }> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.FillTableAIColumn}/${tableId}/fields/${fieldId}/ai-fill`,
    rowIds && rowIds.length ? { row_ids: rowIds } : {},
  )
  return (res.data?.data as { filled: number; skipped: number }) || { filled: 0, skipped: 0 }
}
