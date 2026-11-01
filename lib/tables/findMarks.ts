import type { TransformMatch } from "@/lib/tables/transform"

/** What a find marks (G2b): the matches read so far, in the view's order, and the one it's at. */
export interface FindMarks {
  matches: TransformMatch[]
  current?: TransformMatch
}

/**
 * Each row's matched fields, in the order found; a match without a field
 * marks its row alone. The grid tints those cells, and the phone's list
 * tints those rows and shows their values (G2b-2). Its own module, so the
 * list's chunk takes these few lines and not the transform's requests.
 */
export function matchesByRow(matches: readonly TransformMatch[] | undefined): Map<string, string[]> {
  const byRow = new Map<string, string[]>()
  for (const m of matches ?? []) {
    let fields = byRow.get(m.row)
    if (!fields) byRow.set(m.row, (fields = []))
    if (m.field && !fields.includes(m.field)) fields.push(m.field)
  }
  return byRow
}
