// The rows a burst of a table's live messages names (tables L1, V-693): each
// message heard names the rows it changed and, for a change of cells, their
// fields, never values. lib/tables/useTableRows collects them as each message
// comes, so this rides with a table's first load and stays this small; what a
// burst then reads by id and how it's put in (lib/tables/liveRows,
// liveRun) is a chunk of its own, fetched when the first message is heard.

/** An updated row's fields a burst named, or "row": all of it (a message that named none, a comment's count, a page). */
export type Named = Set<string> | "row"

/** Names a row's changed cells in a burst: the fields a message named, added to those named before, or the whole row when it named none. */
export function nameCells(rows: Map<string, Named>, id: string, fields: unknown): void {
  const was = rows.get(id)
  const named = Array.isArray(fields) && fields.length > 0 && fields.every((f) => typeof f === "string") ? (fields as string[]) : null
  if (was === "row" || !named) return void rows.set(id, "row")
  const now = new Set(was)
  for (const f of named) now.add(f)
  rows.set(id, now)
}
