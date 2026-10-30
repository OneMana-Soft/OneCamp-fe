// Table calls only a lazy chunk makes (the row's page, the formula editor,
// the column menu, a doc's table menu), here so no table's first screen
// carries them (services/tableService.ts is on every one).

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { TablesPost } from "@/services/endpoints/tables"
import { numberSigns } from "@/lib/format/number"
import { inZone, rowPagePath, type FieldType, type FormulaResult, type TableField } from "@/services/tableService"

/** A row's page, made now when it has none: for someone who may edit the row. */
export async function ensureRowPage(tableId: string, rowId: string): Promise<{ doc_uuid: string; made: boolean }> {
  const res = await axiosInstance.post(rowPagePath(tableId, rowId), {})
  return res.data?.data as { doc_uuid: string; made: boolean }
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

// A table's fields as they're made, changed and deleted, and a new option's id:
// only the column menu's chunk and a doc's table menu call them.
/** An id for an option made here: "o_" and ten random characters. */
export function newOptionId(): string {
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return `o_${Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`
}

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


export async function deleteField(tableId: string, fieldId: string): Promise<void> {
  await axiosInstance.post(`${TablesPost.DeleteTableField}/${tableId}/fields/${fieldId}/delete`)
}
