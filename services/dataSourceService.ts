import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

// Data-sources client: governed, READ-ONLY connections to external SQL
// databases (Postgres to start). An admin/agent-manager registers a connection;
// an agent/assistant can then query it the same deterministic way it queries
// native Tables. The connection password is write-only from the FE's point of
// view — the API never returns it, only has_password.
//
// Permission model (mirrors the backend):
//   - config (create/update/delete/enable/test) is agent.manage gated
//   - query/browse (schema, queryable list, aggregate) is per-source visibility

export type DataSourceEngine = "postgres" | "mysql"
export type DataSourceSSLMode = "disable" | "require" | "verify-ca" | "verify-full"
export type DataSourceVisibility = "private" | "workspace"

// Safe, FE-facing view of a source. Never carries the credential.
export interface DataSource {
  id: string
  name: string
  engine: DataSourceEngine
  host: string
  port: number
  database: string
  username: string
  has_password: boolean
  ssl_mode: DataSourceSSLMode
  visibility: DataSourceVisibility
  enabled: boolean
  created_by: string
  can_manage: boolean
  created_at: string
  updated_at: string
}

// Create/update payload. password is optional: omit to leave unchanged on
// update; send "" to clear it.
export interface DataSourceInput {
  name: string
  engine?: DataSourceEngine
  host: string
  port?: number
  database: string
  username?: string
  password?: string
  ssl_mode?: DataSourceSSLMode
  visibility?: DataSourceVisibility
  enabled?: boolean
}

export interface DataSourceColumn {
  name: string
  data_type: "text" | "number" | "date" | "boolean" | "other"
  native_type: string
  nullable: boolean
}

export interface DataSourceTable {
  schema: string
  name: string
  columns: DataSourceColumn[]
}

// Aggregation types mirror the native table aggregate for a consistent UX.
export type DataSourceAggregateOp = "count" | "sum" | "avg" | "min" | "max"
export type DataSourceFilterOp =
  | "eq" | "ne" | "contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty"

export interface DataSourceFilter {
  field: string
  op: DataSourceFilterOp
  value?: string
}

export interface DataSourceAggregateQuery {
  table: string
  group_by?: string
  aggregate?: DataSourceAggregateOp
  value_field?: string
  filters?: DataSourceFilter[]
  limit?: number
  ascending?: boolean
}

export interface DataSourceAggregateBucket {
  label: string
  value: number
  count: number
}

export interface DataSourceAggregateResult {
  table: string
  group_by?: string
  group_by_type?: string
  aggregate: DataSourceAggregateOp
  value_field?: string
  buckets: DataSourceAggregateBucket[]
  truncated: boolean
}

// ───────────── management (agent.manage gated) ─────────────

export async function listDataSources(): Promise<DataSource[]> {
  const res = await axiosInstance.get(GetEndpointUrl.GetDataSources)
  return (res.data?.data as DataSource[]) || []
}

export async function createDataSource(input: DataSourceInput): Promise<DataSource> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateDataSource, input)
  return res.data?.data as DataSource
}

export async function updateDataSource(id: string, input: DataSourceInput): Promise<DataSource> {
  const res = await axiosInstance.post(`${PostEndpointUrl.UpdateDataSource}/${id}/update`, input)
  return res.data?.data as DataSource
}

export async function deleteDataSource(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteDataSource}/${id}/delete`)
}

export async function setDataSourceEnabled(id: string, enabled: boolean): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.SetDataSourceEnabled}/${id}/enabled`, { enabled })
}

// testDataSource opens a read-only connection and pings it. Returns a friendly
// error message on failure (so the card can show what went wrong).
export async function testDataSource(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await axiosInstance.post(`${PostEndpointUrl.TestDataSource}/${id}/test`)
    return { ok: true, message: (res.data?.msg as string) || "connection ok" }
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
      (e as Error)?.message ||
      "connection failed"
    return { ok: false, message: msg }
  }
}

// testDataSourceConfig validates an UNSAVED connection (opens read-only + pings)
// so an operator can check credentials before saving. Returns a friendly result.
export async function testDataSourceConfig(
  input: DataSourceInput,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await axiosInstance.post(PostEndpointUrl.TestDataSourceConfig, input)
    return { ok: true, message: (res.data?.msg as string) || "connection ok" }
  } catch (e: unknown) {
    const msg =
      (e as { response?: { data?: { msg?: string } } })?.response?.data?.msg ||
      (e as Error)?.message ||
      "connection failed"
    return { ok: false, message: msg }
  }
}

// ───────────── query / browse (per-source visibility) ─────────────

export async function listQueryableDataSources(): Promise<DataSource[]> {
  const res = await axiosInstance.get(GetEndpointUrl.GetQueryableDataSources)
  return (res.data?.data as DataSource[]) || []
}

export async function getDataSourceSchema(id: string): Promise<DataSourceTable[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetDataSourceSchema}/${id}/schema`)
  return (res.data?.data as DataSourceTable[]) || []
}

// aggregateDataSource runs a deterministic, read-only aggregation pushed down to
// the external DB. Reuses the exact engine the AI query_data_source tool uses.
export async function aggregateDataSource(
  id: string,
  query: DataSourceAggregateQuery,
): Promise<DataSourceAggregateResult> {
  const res = await axiosInstance.post(`${PostEndpointUrl.AggregateDataSource}/${id}/aggregate`, query)
  return res.data?.data as DataSourceAggregateResult
}

// Multi-step query plan (several metrics, having, share-of-total) — the external
// analog of the native table query plan.
export interface DataSourcePlanMetric {
  aggregate: DataSourceAggregateOp
  value_field?: string
  label?: string
}

export interface DataSourcePlanHaving {
  metric: string
  op: "gt" | "gte" | "lt" | "lte" | "eq" | "ne"
  value: number
}

export interface DataSourceQueryPlan {
  table: string
  filters?: DataSourceFilter[]
  group_by?: string
  metrics: DataSourcePlanMetric[]
  having?: DataSourcePlanHaving[]
  sort_by?: string
  ascending?: boolean
  limit?: number
  share_of?: string
}

export interface DataSourcePlanBucket {
  label: string
  metrics: Record<string, number>
  count: number
  share_pct?: number
}

export interface DataSourcePlanResult {
  table: string
  group_by?: string
  group_by_type?: string
  metrics: string[]
  share_of?: string
  buckets: DataSourcePlanBucket[]
  truncated: boolean
}

// runDataSourceQueryPlan runs a deterministic, read-only MULTI-STEP plan pushed
// down to the external DB — the same engine the AI query_data_source_plan tool
// uses, so a plan re-runs with identical methodology.
export async function runDataSourceQueryPlan(
  id: string,
  plan: DataSourceQueryPlan,
): Promise<DataSourcePlanResult> {
  const res = await axiosInstance.post(`${PostEndpointUrl.QueryPlanDataSource}/${id}/query-plan`, plan)
  return res.data?.data as DataSourcePlanResult
}
