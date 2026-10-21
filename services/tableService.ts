import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { readPages } from "@/lib/http/readPages"
import { browserTZ } from "@/lib/utils/timeZone"
import { GetEndpointUrl } from "@/services/endPoints"
import { TablesGet, TablesPost } from "@/services/endpoints/tables"
import { numberSigns } from "@/lib/format/number"

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
  | "rollup"

// A relation cell holds an array of these refs. A row keeps only {id, type};
// the server reads each item's current name for each reader as it sends the
// row, and an item the reader can't open comes without one, as hidden. A link
// to a table's row comes with the row's current name and its table.
export interface RelationRef {
  id: string
  /** The item's name, when the reader may open it. */
  label?: string
  type: string
  table_id?: string
  /** The reader can't open the item: it shows as "Something you can't open", never by name or id. */
  hidden?: boolean
}

/** Whether a relation cell's item counts the links past those shown ("50 more"), rather than being one. */
export function isMoreRef(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "more"
}

/** Whether a relation cell's item is one the reader can't open, which the server sends without its name. */
export function isHiddenRef(v: unknown): boolean {
  return !!v && typeof v === "object" && (v as { hidden?: unknown }).hidden === true
}

/**
 * A relation cell as a write sends it: each item's id and type, the hidden
 * ones too (a reader never unlinks what they can't see), and no names, which
 * the server reads afresh for each reader. The count of links not shown isn't
 * an item.
 */
export function relationWrite(refs: RelationRef[]): { id: string; type: string }[] {
  return refs.filter((r) => !isMoreRef(r) && !!r.id).map((r) => ({ id: r.id, type: r.type }))
}

export type RelationTarget = "task" | "doc" | "board" | "user" | "project" | "any" | "table"

export type ViewType = "grid" | "board" | "calendar"
export type Visibility = "private" | "workspace"

export interface TableField {
  id: string
  table_id: string
  name: string
  type: FieldType
  config: string // raw JSON object
  position: number
  /** What the field is for: its header's tooltip and the record show it. */
  description?: string | null
  /** A row made through the API, an AI tool or a form must give it; the grid's new row needn't. */
  required?: boolean
  /** What a new row's cell starts as, stored as the field's kind stores a value. */
  default_value?: unknown
  /** The field that names the table's rows, and its first column: one per table. */
  primary?: boolean
  /** When it was deleted: a field in its table's trash. */
  deleted_at?: string | null
}

export interface TableRow {
  id: string
  table_id: string
  values: string // raw JSON object keyed by field id
  position: number
  /** The row's number in its table, in the order rows were made, never given twice. */
  row_no?: number
  created_by?: string | null
  created_at: string
  updated_at: string
  /** AI columns whose cell in this row a person wrote: a fill leaves them be until someone asks for it again. */
  ai_kept?: string[]
  /** How many times the row has been written: a write may name the one it read (the row ledger). */
  version?: number
  /** The row's place among its table's rows, which come in this order. */
  position_key?: string
  /** Who last changed the row. */
  updated_by?: string | null
  /** How many comments the row's open threads hold (a member's read alone; none when there are none). */
  comments?: number
  /** The row's page, the doc it hosts, once someone has written in it (a member's read alone). */
  page?: string
}

/**
 * A row's page as its record reads it (GET /tables/{id}/rows/{rowId}/page):
 * the doc it hosts and its saved body, which the editor shows until its live
 * copy syncs (no doc_uuid while the row has none), and what the person may do
 * with it: read it, or write in it and make it.
 */
export interface RowPage {
  doc_uuid?: string
  body?: string
  level: "view" | "edit"
}

/** The address a row's page is read and made at. */
export function rowPagePath(tableId: string, rowId: string): string {
  return `${TablesGet.GetTableRows}/${tableId}/rows/${rowId}/page`
}

/** A row's page, made now when it has none: for someone who may edit the row. */
export async function ensureRowPage(tableId: string, rowId: string): Promise<{ doc_uuid: string; made: boolean }> {
  const res = await axiosInstance.post(rowPagePath(tableId, rowId), {})
  return res.data?.data as { doc_uuid: string; made: boolean }
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
  /** How many rows the table has, all of them. */
  row_count?: number
}

// A select option as field.config.options keeps it for select/multi_select.
// Cells hold its label; it is known by its id, so a rename moves the cells
// with it. One saved before options had ids has none (optionsOf).
export interface SelectOption {
  id?: string
  label: string
  color?: string
}

/** A select option with its id. */
export type FieldOption = SelectOption & { id: string }

/**
 * The id an option saved without one goes by, here and on the server: its
 * label, which is unique in its field. Saving the field keeps it as the id.
 */
export const legacyOptionId = (label: string) => `label:${label}`

const optionsWithIds = new WeakMap<SelectOption[], FieldOption[]>()

/** A select field's options, each with its id. */
export function optionsOf(f: TableField): FieldOption[] {
  const options = parseFieldConfig(f).options
  if (!Array.isArray(options)) return []
  let out = optionsWithIds.get(options)
  if (!out) {
    out = options.map((o) => ({ ...o, id: o.id || legacyOptionId(o.label) }))
    optionsWithIds.set(options, out)
  }
  return out
}

/** An id for an option made here: "o_" and ten random characters. */
export function newOptionId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`
}

// A field's config, parsed once per field object and config text: every cell
// of every row the grid mounts asks for it (options, formats, due dates).
const parsedConfigs = new WeakMap<TableField, { text: string; value: { options?: SelectOption[]; [k: string]: unknown } }>()

export function parseFieldConfig(f: TableField): { options?: SelectOption[]; [k: string]: unknown } {
  const text = f.config || "{}"
  const hit = parsedConfigs.get(f)
  if (hit && hit.text === text) return hit.value
  let value: { options?: SelectOption[]; [k: string]: unknown }
  try {
    value = JSON.parse(text) || {}
  } catch {
    value = {}
  }
  if (f && typeof f === "object") parsedConfigs.set(f, { text, value })
  return value
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

// A relation field's config: what it links to. For a table's rows: which
// table, its name (when the reader can open it), the field whose links this
// one shows from there (inverseOf), and why it can't link, when it can't.
export function relationOf(f: TableField): {
  target: RelationTarget
  tableId?: string
  tableName?: string
  /** On the field showing another table's links here: that table's field. */
  inverseOf?: string
  /** On a field whose links show in the other table too: the field there. */
  inverse?: string
  error?: string
} {
  const cfg = parseFieldConfig(f)
  const str = (v: unknown) => (typeof v === "string" && v ? v : undefined)
  const target = str(cfg.relation_target) as RelationTarget | undefined
  return {
    target: target ?? "any",
    tableId: str(cfg.table_id),
    tableName: str(cfg.table_name),
    inverseOf: str(cfg.inverse_of),
    inverse: str(cfg.inverse),
    error: str(cfg.error),
  }
}

// How a rollup adds up the linked rows' values.
export type RollupHow =
  | "count"
  | "count_values"
  | "unique_count"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "earliest"
  | "latest"
  | "list"
  | "unique"
  | "checked"

// A rollup field's config as the server sends it: the relation it reads, the
// field it adds up in the linked table, how, what it gives, and why it can't
// be worked out, when it can't.
export function rollupOf(f: TableField): { relation: string; field: string; aggregate: RollupHow | ""; result: FormulaResult; error?: string } {
  const cfg = parseFieldConfig(f)
  const result = cfg.result
  return {
    relation: typeof cfg.relation === "string" ? cfg.relation : "",
    field: typeof cfg.field === "string" ? cfg.field : "",
    aggregate: typeof cfg.aggregate === "string" ? (cfg.aggregate as RollupHow) : "",
    result: result === "number" || result === "date" || result === "checkbox" ? result : "text",
    error: typeof cfg.error === "string" ? cfg.error : undefined,
  }
}

/** Whether a field's cells are worked out on each read (a formula or a rollup), so they can't be typed in. */
export function isComputed(f: TableField): boolean {
  return f.type === "formula" || f.type === "rollup"
}

/** What a formula or a rollup gives, and why it can't be worked out, when it can't. */
export function computedOf(f: TableField): { result: FormulaResult; error?: string } {
  const { result, error } = f.type === "rollup" ? rollupOf(f) : formulaOf(f)
  return { result, error }
}

/** Whether a field holds numbers: a number column, or a formula or a rollup that gives one. */
export function isNumeric(f: TableField): boolean {
  return f.type === "number" || (isComputed(f) && computedOf(f).result === "number")
}

/** Why a field can't be worked out or link where it should, if it can't: a formula, a rollup or a relation to a table. */
export function fieldProblem(f: TableField): string | undefined {
  if (isComputed(f)) return computedOf(f).error
  if (f.type === "relation") return relationOf(f).error
  return undefined
}

// A table read for this reader: formulas count TODAY() where they are.
function inZone(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}tz=${encodeURIComponent(browserTZ())}`
}

// The key a table's bundle is fetched and cached under.
export function tableBundleKey(tableId: string): string {
  return inZone(`${GetEndpointUrl.GetTable}/${tableId}`)
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
  const res = await axiosInstance.post(TablesPost.CreateTable, input)
  return res.data?.data as DataTable
}

/**
 * Changes a table's own settings: only those given, at least one. The page
 * and the list sent all four from their copy of the table, so a copy from
 * before someone made it private put it back on show to the workspace with a
 * rename (TAB-BUG-12).
 */
export async function updateTable(
  id: string,
  change: { name?: string; description?: string; icon?: string; visibility?: Visibility },
): Promise<DataTable> {
  const res = await axiosInstance.post(`${TablesPost.UpdateTable}/${id}/update`, change)
  return res.data?.data as DataTable
}

export async function deleteTable(id: string): Promise<void> {
  await axiosInstance.post(`${TablesPost.DeleteTable}/${id}/delete`)
}

// ───────────── rows ─────────────

/**
 * Adds a row. The server puts it after every row there is, wherever the
 * reader's page has got to: a place worked out here came from the rows the
 * page held, and a row placed after them was lost past the 500th. A table
 * being made from rows sent at once (a doc's table turned into one) names
 * each row's place, to keep their order.
 */
export async function createRow(tableId: string, values: Record<string, unknown>, position?: number): Promise<TableRow> {
  const res = await axiosInstance.post(inZone(`${TablesPost.CreateTableRow}/${tableId}/rows`), position === undefined ? { values } : { values, position })
  return res.data?.data as TableRow
}

/**
 * Sets the cells given, and only those: the row's other cells and its place
 * stay as they are on the server, whatever this reader's copy says. A whole
 * row sent back from a copy put back what someone else had written since.
 */
export async function patchRow(tableId: string, rowId: string, values: Record<string, unknown>): Promise<TableRow> {
  const res = await axiosInstance.post(inZone(`${TablesPost.PatchTableRow}/${tableId}/rows/${rowId}/patch`), { values })
  return res.data?.data as TableRow
}

/**
 * A page of a table's rows, in the table's order: `limit` rows from the
 * `offset`th (the server answers at most 1,000). Quiet when it fails: the
 * page reading it says so where the rows would be.
 */
export async function listRows(tableId: string, offset: number, limit: number, signal?: AbortSignal): Promise<TableRow[]> {
  const res = await axiosInstance.get(inZone(`${TablesGet.GetTableRows}/${tableId}/rows?limit=${limit}&offset=${offset}`), { ...OWN_ERRORS, signal })
  return (res.data?.data as TableRow[] | null) ?? []
}

/** Rows each read of a whole table asks for: the most the server answers. */
const EVERY_ROW_PAGE = 1000

/**
 * Every row of a table, read page by page from the first (Export CSV), each
 * once. onProgress hears how many have been read.
 */
export async function readEveryRow(tableId: string, opts: { onProgress?: (read: number) => void; signal?: AbortSignal } = {}): Promise<TableRow[]> {
  const { items } = await readPages((offset, limit) => listRows(tableId, offset, limit, opts.signal), {
    pageSize: EVERY_ROW_PAGE,
    concurrency: 2,
    onProgress: opts.onProgress,
    signal: opts.signal,
  })
  return eachRowOnce(items)
}

/** Rows in order, each once: a row read twice where a page met the next (the table changed between reads) keeps its first place. */
export function eachRowOnce(rows: TableRow[]): TableRow[] {
  const seen = new Set<string>()
  const out: TableRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out.length === rows.length ? rows : out
}

export async function deleteRow(tableId: string, rowId: string): Promise<void> {
  await axiosInstance.post(`${TablesPost.DeleteTableRow}/${tableId}/rows/${rowId}/delete`)
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
  /** OWN_ERRORS when the caller says a failure itself. */
  config?: typeof OWN_ERRORS,
): Promise<AggregateResult> {
  const res = await axiosInstance.post(
    inZone(`${TablesPost.AggregateTable}/${tableId}/aggregate`),
    query,
    config,
  )
  return res.data?.data as AggregateResult
}

// ───────────── fields ─────────────

export async function createField(
  tableId: string,
  input: { name: string; type: FieldType; config?: Record<string, unknown>; position?: number },
): Promise<TableField> {
  const res = await axiosInstance.post(`${TablesPost.CreateTableField}/${tableId}/fields`, input)
  return res.data?.data as TableField
}

/**
 * A change to a field: only what it names. The server keeps the stored value
 * of whatever a save leaves out, so a rename is `{name}`, a move
 * `{position}`, a setting `{config}` (with `removed_options` to take options
 * out) and a type change `{type, config}`, from the type picker. A save of
 * the page's copy put back what had changed since it was read: a stale type
 * turned a column changed meanwhile back (audit B1), a stale place undid a
 * move, a stale name a rename.
 */
export interface FieldPatch {
  name?: string
  type?: FieldType
  config?: Record<string, unknown>
  position?: number
  description?: string
  required?: boolean
  /** null takes the default away. */
  default_value?: unknown
  /** true makes it the primary field; a field stops being it only by another becoming it. */
  primary?: true
}

/**
 * Saves a field's patch, sending only the keys it names; one naming nothing
 * sends nothing. A type change carries the reader's number signs, so a column
 * made numbers reads "1,5" as the reader writes it (audit B3).
 */
export async function updateField(tableId: string, fieldId: string, patch: FieldPatch): Promise<void> {
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  if (!Object.keys(body).length) return
  await axiosInstance.post(
    `${TablesPost.UpdateTableField}/${tableId}/fields/${fieldId}/update`,
    patch.type ? { ...body, ...numberSigns() } : body,
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
  const res = await axiosInstance.post(inZone(`${TablesPost.PreviewTableFormula}/${tableId}/formula/preview`), {
    formula,
    field_id: fieldId,
  })
  return res.data?.data as FormulaPreview
}

/** What changing a field's type would do to its cells: kept as they are, converted, and values cleared. */
export interface ConvertCounts {
  kept: number
  converted: number
  cleared: number
}

/**
 * What changing a field's type would do to its cells, counted by the server
 * over every row, without changing anything: what the column menu says
 * before it asks. Quiet when it fails: the menu says so.
 */
export async function previewConversion(tableId: string, fieldId: string, type: FieldType): Promise<ConvertCounts> {
  const res = await axiosInstance.post(`${TablesPost.UpdateTableField}/${tableId}/fields/${fieldId}/convert-preview`, { type, ...numberSigns() }, OWN_ERRORS)
  return res.data?.data as ConvertCounts
}

export async function deleteField(tableId: string, fieldId: string): Promise<void> {
  await axiosInstance.post(`${TablesPost.DeleteTableField}/${tableId}/fields/${fieldId}/delete`)
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
    `${TablesPost.FillTableAIColumn}/${tableId}/fields/${fieldId}/ai-fill`,
    rowIds && rowIds.length ? { row_ids: rowIds } : {},
  )
  return (res.data?.data as { filled: number; skipped: number }) || { filled: 0, skipped: 0 }
}

// The key a table's fields are fetched under, for choosing what a rollup adds
// up there.
export function tableFieldsKey(tableId: string): string {
  return `${TablesGet.GetTableFields}/${tableId}/fields`
}

// A table's rows to link to, by name: those whose name holds the text, or the
// first ones when it's empty.
export async function pickRows(tableId: string, q: string): Promise<{ id: string; label: string }[]> {
  const res = await axiosInstance.get(`${TablesGet.PickTableRows}/${tableId}/rows/pick`, { params: { q } })
  return (res.data?.data as { id: string; label: string }[]) || []
}

/**
 * A row's values as a copy of it is written (Duplicate): without what the
 * server works out on each read (formulas, rollups) or keeps apart (links to
 * tables' rows, which change through changeLinks), and links to items as
 * their ids alone.
 */
export function writableValues(fields: TableField[], values: Record<string, unknown>): Record<string, unknown> {
  const out = { ...values }
  for (const f of fields) {
    if (isComputed(f) || (f.type === "relation" && relationOf(f).target === "table")) delete out[f.id]
    else if (f.type === "relation" && Array.isArray(out[f.id])) out[f.id] = relationWrite(out[f.id] as RelationRef[])
  }
  return out
}

// Links a row to rows of the table a field links to, or unlinks it: the
// field's own links, or those shown from the other table.
export async function changeLinks(
  tableId: string,
  rowId: string,
  fieldId: string,
  change: { add?: string[]; remove?: string[] },
): Promise<TableRow> {
  const res = await axiosInstance.post(`${TablesPost.ChangeTableLinks}/${tableId}/rows/${rowId}/links`, {
    field: fieldId,
    add: change.add ?? [],
    remove: change.remove ?? [],
  })
  return res.data?.data as TableRow
}
