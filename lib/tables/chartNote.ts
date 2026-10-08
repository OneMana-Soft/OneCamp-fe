import type { AggregateResult } from "@/services/tableService"

/**
 * What a table's chart says under it when its numbers leave something out:
 * groups past the top ones, or rows the server didn't count (past the first
 * 5,000, or where a formula took too much working out). Nothing when the
 * chart is whole.
 */
export function partialNote(result: Pick<AggregateResult, "truncated" | "buckets" | "distinct_groups">): string | null {
  if (!result.truncated) return null
  if (result.buckets.length < result.distinct_groups) {
    return `Showing the top ${result.buckets.length} of ${result.distinct_groups} groups.`
  }
  return "Some rows aren't counted: those past the first 5,000, or where a formula took too much working out."
}
