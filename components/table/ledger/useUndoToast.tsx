"use client"

// What a table's change says once it's made (tables A2, the row ledger): a
// toast naming it, with Undo, which reverses that change set alone, or brings
// back what went to the trash. What an undo left, as it changed again since,
// it says.

import * as React from "react"
import { useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { undoneNote, type UndoResult } from "@/lib/tables/ledger"

/** How long a change's toast offers Undo. */
const UNDO_FOR_MS = 8000

/**
 * offerUndo(title, undo): a toast saying title, whose Undo runs undo and then
 * onDone (the page reads the table again either way). An undo that answers
 * with an UndoResult says what it left.
 */
export function useUndoToast(onDone: () => void) {
  const { toast } = useToast()
  return React.useCallback(
    (title: string, undo: () => Promise<UndoResult | unknown>, description?: string) => {
      toast({
        title,
        description,
        duration: UNDO_FOR_MS,
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              try {
                const r = await undo()
                toast(r && typeof r === "object" && "skipped" in r ? undoneNote(r as UndoResult) : { title: "Undone" })
              } catch (e) {
                toast({ title: "Couldn't undo that", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
              } finally {
                onDone()
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      })
    },
    [toast, onDone],
  )
}
