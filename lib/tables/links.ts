// Rollups: what one can do with a field of the rows a relation links to, by
// the kind of field it is. The server checks the same.

import type { RollupHow, TableField } from "@/services/tableService"
import { relationOf } from "@/services/tableService"
import type { FilterKind } from "@/lib/fieldTypes/types"

export const ROLLUP_LABELS: Record<RollupHow, string> = {
  count: "Count the rows",
  count_values: "Count the values",
  unique_count: "Count unique values",
  sum: "Sum",
  average: "Average",
  min: "Smallest",
  max: "Largest",
  earliest: "Earliest",
  latest: "Latest",
  list: "List them",
  unique: "List each once",
  checked: "Count the ticked",
  formula: "With a formula",
}

/** The ways a rollup can add up a field of a kind, the likeliest first; with no field, it can only count the rows. */
export function rollupOptions(kind: FilterKind | null): RollupHow[] {
  switch (kind) {
    case null:
      return ["count"]
    case "number":
      return ["sum", "average", "min", "max", "count_values", "unique_count", "list", "unique", "formula", "count"]
    case "date":
      return ["earliest", "latest", "count_values", "unique_count", "list", "unique", "formula", "count"]
    case "checkbox":
      return ["checked", "formula", "count"]
    default:
      return ["list", "unique", "count_values", "unique_count", "formula", "count"]
  }
}

/** Whether a rollup can add up a field: any but a link to a table, whose values a rollup doesn't work out; another rollup by what it gives (the server checks how deep they go). */
export function canRollUp(f: TableField): boolean {
  return !(f.type === "relation" && relationOf(f).target === "table")
}

/** Whether a field of the linked rows is worked out from other rows (a rollup, a link to a table), which a rollup's conditions and sort can't read: the server's workedOutElsewhere. */
export function workedOutElsewhere(f: TableField): boolean {
  return f.type === "rollup" || !canRollUp(f)
}

/** Whether a rollup can sort its linked rows by a field: one of their own a view can sort by, so no links, rollups, lists of choices, files or people (the server's sortProblem). */
export function canSortRollupBy(f: TableField): boolean {
  return !workedOutElsewhere(f) && !["relation", "multi_select", "attachment", "person", "people", "created_by", "modified_by"].includes(f.type)
}

/** The relation fields a rollup can read: those linking to a table's rows. */
export function tableRelations(fields: TableField[]): TableField[] {
  return fields.filter((f) => f.type === "relation" && relationOf(f).target === "table")
}
