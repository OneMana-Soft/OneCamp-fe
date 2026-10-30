// What a table's undo or redo says once done (tables A2): on the table's first
// load, while the rest of the ledger (lib/tables/ledger) loads on first use.

import type { UndoResult } from "@/lib/tables/ledger"

/** What an undo's or a redo's toast says, and what it left. Pure. */
export function undoneNote(r: UndoResult, redo = false): { title: string; description?: string } {
  const title = redo ? "Redone" : "Undone"
  if (!r.skipped) return { title }
  const one = r.skipped === 1
  return { title, description: `${r.skipped.toLocaleString()} ${one ? "change was left as it is: it" : "changes were left as they are: they"} changed again since.` }
}
