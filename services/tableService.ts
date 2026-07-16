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

// ───────────── aggregate (chart view / analytics) ─────────────

export type AggregateOp = "count" | "sum" | "avg" | "min" | "max"

export type FilterOp =
  | "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty"

// A single row-level predicate. `field` is a column id or name.
export interface AggregateFilter {
  field: string
  op: FilterOp
  value?: string
}

// Describes an aggregation. group_by/value_field/filter.field may each be a
// column id or a case-insensitive column name (server resolves either).
export interface AggregateQuery {
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
    `${PostEndpointUrl.AggregateTable}/${tableId}/aggregate`,
    query,
  )
  return res.data?.data as AggregateResult
}

// ───────────── query plan (multi-step, inspectable analytics) ─────────────

// A single aggregated measure computed per group. label is optional; the server
// derives a stable one ("count", "sum_amount", …) when omitted.
export interface PlanMetric {
  aggregate: AggregateOp
  value_field?: string
  label?: string
}

// Filters GROUPS by a computed metric value (e.g. keep groups whose count > 10).
export interface PlanHaving {
  metric: string
  op: FilterOp
  value: number
}

// The full, inspectable pipeline: filter rows → group → one-or-more metrics →
// having (group filter) → share-of-total → sort → limit. Round-trippable so a
// human can edit a knob and re-run it to the identical-methodology answer. This
// is the exact wire shape the backend business.QueryPlan expects.
export interface QueryPlanSpec {
  filters?: AggregateFilter[]
  group_by?: string
  metrics: PlanMetric[]
  having?: PlanHaving[]
  sort_by?: string
  ascending?: boolean
  limit?: number
  share_of?: string
}

// One group's row in the result: its label, every metric's value, the matched
// row count, and (when share_of is set) that metric's share of the grand total.
export interface PlanBucket {
  label: string
  metrics: Record<string, number>
  count: number
  share_pct?: number
}

export interface PlanResult {
  group_by?: string
  group_by_type?: string
  metrics: string[]
  share_of?: string
  buckets: PlanBucket[]
  matched_rows: number
  scanned_rows: number
  distinct_groups: number
  truncated: boolean
}

// runTableQueryPlan runs a deterministic, multi-step query plan over a table's
// rows server-side (permission-scoped, bounded) and returns the PlanResult. It
// hits the SAME pure engine the AI query_plan tool uses, so a plan a human edits
// in the "Query plan" card re-runs with identical methodology — not a fresh
// guess. Read-only.
export async function runTableQueryPlan(
  tableId: string,
  plan: QueryPlanSpec,
): Promise<PlanResult> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.RunTableQueryPlan}/${tableId}/query-plan`,
    plan,
  )
  return res.data?.data as PlanResult
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
