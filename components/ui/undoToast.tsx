"use client"

// A change's toast with Undo: a table's (tables A2), a setting's (design-14),
// a delete the server kept (V-78).

import * as React from "react"
import { toast, useToast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import type { UndoOffer } from "@/components/ui/saveStatus"

type Note = { title: string; description?: string }

// One go at undo: "Undone", or noteOf's reading of its answer (false: not
// held), or why not. A retry-later answer (503: the server kept the work and
// asks for another go, as a status whose restore didn't finish does) offers
// Retry, which has the same go again.
async function attempt(say: typeof toast, undo: () => unknown, onDone?: () => void, noteOf?: (r: unknown) => Note | undefined): Promise<void> {
  try {
    const r = await undo()
    say(r === false ? { title: "Couldn't undo that", description: "Its row says why.", variant: "destructive" } : (noteOf?.(r) ?? { title: "Undone" }))
  } catch (e) {
    const later = apiErrorStatus(e) === 503
    say({
      title: later ? "Undo didn't finish" : "Couldn't undo that",
      description: apiErrorMessage(e, "Try again in a moment."),
      variant: "destructive",
      action: later ? <ToastAction altText="Retry" onClick={() => attempt(say, undo, onDone, noteOf)}>Retry</ToastAction> : undefined,
    })
  } finally {
    onDone?.()
  }
}

// action names what Undo takes back when the title alone doesn't ("Undo fill").
function show(say: typeof toast, title: string, undo: () => unknown, description?: string, onDone?: () => void, noteOf?: (r: unknown) => Note | undefined, action = "Undo") {
  say({
    title,
    description,
    duration: 8000,
    action: (
      <ToastAction altText={action} onClick={() => attempt(say, undo, onDone, noteOf)}>
        {action}
      </ToastAction>
    ),
  })
}

/** A saved setting offered back (useSaveStatus); its undo is never offered back itself. */
export function offerBack({ what, description, undo }: UndoOffer, undoing: { current: boolean }) {
  show(toast, what, async () => {
    undoing.current = true
    try {
      return await undo()
    } finally {
      undoing.current = false
    }
  }, description)
}

/** A delete's toast with Undo, from restoreService's offerUndo once this chunk has loaded. */
export function showUndo(title: string, undo: () => unknown, description?: string) {
  show(toast, title, undo, description)
}

/** offer(title, undo, description?, action?) for a page, with onDone after every Undo. */
export function useUndoToast(onDone?: () => void, noteOf?: (r: unknown) => Note | undefined) {
  const { toast: say } = useToast()
  return React.useCallback((title: string, undo: () => unknown, description?: string, action?: string) => show(say, title, undo, description, onDone, noteOf, action), [say, onDone, noteOf])
}
