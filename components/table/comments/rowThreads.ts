/**
 * A row's threads as its record says them (tables A8). Pure, so each is
 * tested without rendering.
 */
import type { ThreadView } from "@/components/threads/types"
import type { TableField } from "@/services/tableService"

/** The field a thread on a cell is on; null for a thread on the whole row. */
export function cellOf(thread: Pick<ThreadView, "anchor">): string | null {
  if (thread.anchor.kind !== "cell") return null
  const field = thread.anchor.meta?.field
  return typeof field === "string" && field ? field : null
}

/** Where a thread is, in words: "On this row", "On Status", or a column since deleted. */
export function threadPlace(thread: Pick<ThreadView, "anchor">, fields: Pick<TableField, "id" | "name">[]): string {
  const field = cellOf(thread)
  if (!field) return "On this row"
  const f = fields.find((x) => x.id === field)
  return f ? `On ${f.name}` : "On a deleted column"
}

/**
 * How many comments a row's open threads hold, in all and on each cell: what
 * the record's heading and its fields' comment buttons count. Resolved
 * threads aren't counted, as the grid's count isn't.
 */
export function commentCounts(threads: Pick<ThreadView, "anchor" | "status" | "comments">[]): { total: number; byField: Record<string, number> } {
  const byField: Record<string, number> = {}
  let total = 0
  for (const t of threads) {
    if (t.status !== "open") continue
    total += t.comments.length
    const field = cellOf(t)
    if (field) byField[field] = (byField[field] ?? 0) + t.comments.length
  }
  return { total, byField }
}
