/** A task's formula value as shown, by the one rule (lib/tables/formulaValue):
 * apart from lib/tasks/fields, so routes showing no formula never reach it. */

import { shortDateTime } from "@/lib/utils/date/shortDate"
import { formatLocale } from "@/lib/tables/numberFormat"
import { formulaLine, showFormulaValue, type FormulaShown, type FormulaWriter } from "@/lib/tables/formulaValue"
import { formatDay, formatFieldValue, type FieldValue, type TaskField } from "@/lib/tasks/fields"

/** Numbers in the reader's locale; a day as a date field's. */
export const TASK_WRITER: FormulaWriter = { number: (n) => formatLocale(n, {}), date: (d, s, day) => (day ? formatDay(s) : shortDateTime(d)) }

/** A formula field's value, as the one rule reads it. */
export const formulaShown = (field: Pick<TaskField, "result">, value: unknown): FormulaShown => showFormulaValue(value, field.result, TASK_WRITER)

/** A field's value as text, a formula's included. */
export function fieldText(field: TaskField, value: FieldValue | undefined, nameOf?: (id: string) => string | undefined): string {
  if (field.type !== "formula") return formatFieldValue(field, value, nameOf)
  return value === undefined || value === null || value === "" ? "" : formulaLine(formulaShown(field, value))
}
