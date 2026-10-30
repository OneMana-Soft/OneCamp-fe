import type { FieldType, TableField } from "@/services/tableService"
import { browserTZ } from "@/lib/utils/timeZone"

/**
 * A spreadsheet coming in as tables (tables S1, business/DataTable
 * sheetImport.go): what the server's preview of a file shows, and the choices
 * the person sends back. The server reads the file, guesses each column's
 * kind and keeps the job ready; the person keeps the sheets and columns they
 * want, names them, picks their kinds, or brings a sheet into a table they
 * have, matching its rows by a column; then the import runs as chosen.
 */

/** The files a spreadsheet import reads (business/ContentIO sheets.go). */
export const SHEET_EXTENSIONS = [".csv", ".tsv", ".xlsx", ".xlsm", ".ods"]

/** The kinds a sheet's column may be made (sheetKinds). */
export const SHEET_KINDS: readonly FieldType[] = ["text", "long_text", "number", "date", "checkbox", "select", "multi_select", "email", "url", "phone", "duration"]

/** The kinds whose value can name the row a sheet's row changes (matchKinds). */
const MATCH_KINDS = new Set<FieldType>(["text", "number", "date", "email", "url", "phone", "duration"])

export interface NumberSigns {
  decimal?: string
  group?: string
}

export interface PreviewField {
  key: string
  name: string
  type: FieldType
  /** Coming into a table: the field it goes into. */
  field?: string
  leave?: boolean
}

export interface PreviewSheet {
  index: number
  name: string
  hidden?: boolean
  into?: string
  into_name?: string
  match_by?: string
  /** Rows with a value under its header. */
  rows: number
  fields: PreviewField[]
  /** Its first rows, each cell as the file shows it. */
  sample: string[][]
  notes?: { field: string; code: string; msg: string }[]
}

export interface SheetPreview {
  signs: NumberSigns
  day_first: boolean
  zone: string
  sheets: PreviewSheet[]
}

export interface FieldChoice {
  key: string
  name?: string
  type?: FieldType
  field?: string
  leave?: boolean
}

export interface SheetChoice {
  index: number
  bring: boolean
  into?: string
  match_by?: string
  fields: FieldChoice[]
}

export interface SheetChoices {
  signs?: NumberSigns
  day_first?: boolean
  zone?: string
  sheets: SheetChoice[]
}

/** A preview read whole: anything the server didn't say is empty, never missing. */
export function readPreview(raw: unknown): SheetPreview | null {
  const p = raw as Partial<SheetPreview> | null
  if (!p || !Array.isArray(p.sheets)) return null
  return {
    signs: p.signs ?? {},
    day_first: p.day_first !== false,
    zone: p.zone ?? "",
    sheets: p.sheets.map((s) => ({ ...s, fields: s.fields ?? [], sample: s.sample ?? [], notes: s.notes ?? [] })),
  }
}

/**
 * The choices that bring a file as its preview shows it: every sheet that
 * isn't hidden, each column as it was guessed. Into a table, the sheet the
 * person brings there (the first, unless another is named) is the only one.
 */
export function choicesOf(preview: SheetPreview, into?: { table: string; sheet: number }): SheetChoices {
  return {
    signs: preview.signs,
    day_first: preview.day_first,
    zone: preview.zone || browserTZ(),
    sheets: preview.sheets.map((s) => {
      if (into) {
        const here = s.index === into.sheet
        return {
          index: s.index,
          bring: here,
          ...(here ? { into: into.table, match_by: s.into === into.table ? s.match_by ?? "" : "" } : {}),
          fields: s.fields.map((f) => (here ? { key: f.key, field: f.field ?? "", leave: !!f.leave || !f.field } : { key: f.key, leave: true })),
        }
      }
      return { index: s.index, bring: !s.hidden, fields: s.fields.map((f) => ({ key: f.key, name: f.name, type: f.type, leave: !!f.leave })) }
    }),
  }
}

/** Choices with one sheet's choice changed. */
export function withSheet(c: SheetChoices, index: number, change: (s: SheetChoice) => SheetChoice): SheetChoices {
  return { ...c, sheets: c.sheets.map((s) => (s.index === index ? change(s) : s)) }
}

/** A sheet's choice with one column's choice changed. */
export function withColumn(s: SheetChoice, key: string, patch: Partial<FieldChoice>): SheetChoice {
  const fields = s.fields.map((f) => (f.key === key ? { ...f, ...patch } : f))
  // The column naming the rows the sheet changes, once changed, names none until it's picked again.
  return key === s.match_by ? { ...s, fields, match_by: "" } : { ...s, fields }
}

/** The fields of a table a sheet's column may come into: those whose cells a sheet can fill. */
export function fillableFields(fields: TableField[]): TableField[] {
  return fields.filter((f) => SHEET_KINDS.includes(f.type))
}

/** The columns of a sheet coming into a table whose values can name its rows: each into a field of a kind that keeps a value whole. */
export function matchColumns(s: SheetChoice, fields: TableField[]): FieldChoice[] {
  const kind = new Map(fields.map((f) => [f.id, f.type]))
  return s.fields.filter((f) => !f.leave && !!f.field && MATCH_KINDS.has(kind.get(f.field) as FieldType))
}

/** How many rows the choices bring: those of every sheet that comes with a column. */
export function rowsToCome(preview: SheetPreview, c: SheetChoices): number {
  return c.sheets.reduce((n, s) => (s.bring && s.fields.some((f) => !f.leave) ? n + (preview.sheets.find((p) => p.index === s.index)?.rows ?? 0) : n), 0)
}
