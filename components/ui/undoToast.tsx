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
    const description = apiErrorMessage(e, "Try again in a moment.")
    if (apiErrorStatus(e) === 503) sayRetry(say, "Undo didn't finish", description, () => attempt(say, undo, onDone, noteOf))
    else say({ title: "Couldn't undo that", description, variant: "destructive" })
  } finally {
    onDone?.()
  }
}

// A retry-later answer's toast (503: nothing was lost, and another go may
// work): Retry has the same go again, only when pressed. One that `stays` has
// no timer: it goes with its Retry or its x (V-617). Pressed from the keyboard,
// Retry hands the focus back to where it was as the toast came, never to the
// page (DESIGN-BUILD-129's F2); a pointer's press moves none.
function sayRetry(say: typeof toast, title: string, description: string, retry: () => unknown, stays?: boolean) {
  const from = document.activeElement
  return say({
    title,
    description,
    variant: "destructive",
    duration: stays ? Infinity : undefined,
    action: (
      <ToastAction
        altText="Retry"
        onClick={(e) => {
          if (!e.detail && from instanceof HTMLElement) from.focus()
          void retry()
        }}
      >
        Retry
      </ToastAction>
    ),
  })
}

/**
 * A write the server asked to have again later, offered back with Retry (a
 * table cell's save kept as unsaved, V-583; a range write, V-617), its toast
 * handed back. One that `stays` holds work nothing else on screen shows (a
 * paste's new rows): it waits for the person, with no timer.
 */
export function offerRetry(title: string, description: string, retry: () => unknown, stays?: boolean) {
  return sayRetry(toast, title, description, retry, stays)
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
