"use client"

// What a table's change says once it's made (tables A2): the shared toast
// with Undo, which reverses that change set alone or brings back what went to
// the trash, and says what an undo left as it changed again since.

import { useUndoToast as useChangeUndoToast } from "@/components/ui/undoToast"
import type { UndoResult } from "@/lib/tables/ledger"
import { undoneNote } from "@/lib/tables/undoneNote"

/** What a table's undo left, when its answer says. */
const noteOf = (r: unknown) => (r && typeof r === "object" && "skipped" in r ? undoneNote(r as UndoResult) : undefined)

/** offerUndo(title, undo); onDone after every Undo (the page reads the table again). */
export function useUndoToast(onDone: () => void) {
  return useChangeUndoToast(onDone, noteOf)
}
