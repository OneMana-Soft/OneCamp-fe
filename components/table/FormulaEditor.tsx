"use client"

// The editor for a table's formula field: the one formula editor
// (components/formula/FormulaEditor) with the table's fields to hand, a
// linked table's after {Link}., checked against the first rows
// (services/tableCalls previewFormula) and written in the tables' formats.

import * as React from "react"
import { FormulaEditor as Editor, type FormulaInput } from "@/components/formula/FormulaEditor"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { tableWriter } from "@/lib/tables/formula"
import { useFetch } from "@/hooks/useFetch"
import { relationOf, tableFieldsKey, type TableField } from "@/services/tableService"
import { previewFormula } from "@/services/tableCalls"

export { highlightFormula } from "@/components/formula/FormulaEditor"

const WRITE = tableWriter()

/** A table's fields as a formula's inputs: a relation's linked table named for {Link}.{Field}. */
const inputsOf = (fields: TableField[]): FormulaInput[] =>
  fields.map((f) => ({ id: f.id, name: f.name, label: fieldKind(f.type).label, glyph: fieldKind(f.type).glyph, linked: f.type === "relation" ? relationOf(f).tableId : undefined }))

/** A linked table's fields, read as the caret reaches {Link}. */
function useLinkedFields(tableId: string | undefined): FormulaInput[] {
  const { data } = useFetch<{ data: TableField[] }>(tableId ? tableFieldsKey(tableId) : "", undefined, undefined, { suppressErrorToast: true } as never)
  return React.useMemo(() => inputsOf(data?.data ?? []), [data])
}

export function FormulaEditor({
  tableId,
  fields,
  fieldId,
  value,
  onChange,
}: {
  tableId: string
  /** The table's fields, to put in the formula. */
  fields: TableField[]
  /** The formula field being edited; none for a new one. */
  fieldId?: string
  value: string
  onChange: (formula: string) => void
}) {
  const inputs = React.useMemo(() => inputsOf(fields), [fields])
  const preview = React.useCallback((formula: string, id?: string) => previewFormula(tableId, formula, id), [tableId])
  return <Editor inputs={inputs} preview={preview} write={WRITE} useLinked={useLinkedFields} fieldId={fieldId} value={value} onChange={onChange} />
}
