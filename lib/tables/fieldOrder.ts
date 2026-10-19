import type { TableField } from "@/services/tableService"

type Ordered = Pick<TableField, "position" | "primary">

/**
 * A table's fields in the order every view shows them: by position, with the
 * primary field first (tables A1, FD-14). The primary names the table's rows,
 * as a record's title, a card's, a link's and the grid's first column, so it
 * always leads, even where a field was later given a place before it. The
 * server marks one per table (a table from before the mark has its first
 * field by position as its primary), so with none marked this is the order
 * by position. Pure: the list given is never changed.
 */
export function fieldOrder<T extends Ordered>(fields: readonly T[]): T[] {
  const sorted = [...fields].sort((a, b) => a.position - b.position)
  const at = sorted.findIndex((f) => f.primary)
  if (at > 0) sorted.unshift(...sorted.splice(at, 1))
  return sorted
}
