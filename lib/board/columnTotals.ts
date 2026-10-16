import { isClosedStatus } from "@/lib/taskStatus"

/**
 * Each board column's total, from the board's answer (PROJ-BUG-8). The server
 * counts every column over the same filters as its cards: a category's own
 * tasks under its key (todo, inProgress, done…), and each custom status's under
 * its id, as lib/taskStatus columnsByStatus splits them. A server without those
 * counts sends only the closed categories' totals, which stand for Done and
 * Cancelled as they always have.
 */
export function columnTotals(
  counts: Record<string, number> | undefined,
  closed: { done?: number; canceled?: number },
): Record<string, number | undefined> {
  return counts ?? { done: closed.done, canceled: closed.canceled }
}

/**
 * The open tasks the server counted: every column whose status is open, by the
 * project's statuses. Undefined until every column's status is known (a custom
 * one before the statuses load), rather than a guess.
 */
export function openTotal(counts: Record<string, number> | undefined, options: { value: string; category?: string }[]): number | undefined {
  if (!counts) return undefined
  const category = new Map(options.map((o) => [o.value, o.category ?? o.value]))
  let n = 0
  for (const [key, c] of Object.entries(counts)) {
    const cat = category.get(key)
    if (cat === undefined) return undefined
    if (!isClosedStatus(cat)) n += c
  }
  return n
}
