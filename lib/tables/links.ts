// Rollups: what one can do with a field of the rows a relation links to, by
// the kind of field it is. The server checks the same.

import type { RollupHow, TableField } from "@/services/tableService"
import { relationOf } from "@/services/tableService"
import type { FieldKind } from "@/lib/tables/viewRules"

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
}

/** The ways a rollup can add up a field of a kind, the likeliest first; with no field, it can only count the rows. */
export function rollupOptions(kind: FieldKind | null): RollupHow[] {
  switch (kind) {
    case null:
      return ["count"]
    case "number":
      return ["sum", "average", "min", "max", "count_values", "unique_count", "list", "unique", "count"]
    case "date":
      return ["earliest", "latest", "count_values", "unique_count", "list", "unique", "count"]
    case "checkbox":
      return ["checked", "count"]
    default:
      return ["list", "unique", "count_values", "unique_count", "count"]
  }
}

/** Whether a rollup can add up a field: not another rollup, nor a link to a table, whose values a rollup doesn't work out. */
export function canRollUp(f: TableField): boolean {
  if (f.type === "rollup") return false
  return !(f.type === "relation" && relationOf(f).target === "table")
}

/** The relation fields a rollup can read: those linking to a table's rows. */
export function tableRelations(fields: TableField[]): TableField[] {
  return fields.filter((f) => f.type === "relation" && relationOf(f).target === "table")
}
