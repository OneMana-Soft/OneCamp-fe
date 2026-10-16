"use client"

import * as React from "react"

// Whether "Linked from" shows above a doc, for this person on this device
// (Customize page). Shown unless they hid it.
const key = (docId: string) => `onecamp-doc-backlinks-hidden:${docId}`
const listeners = new Set<() => void>()

function shownOf(docId: string): boolean {
  try {
    return localStorage.getItem(key(docId)) !== "1"
  } catch {
    return true
  }
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useBacklinksShown(docId: string): [boolean, (shown: boolean) => void] {
  const shown = React.useSyncExternalStore(subscribe, () => shownOf(docId), () => true)
  const set = React.useCallback(
    (next: boolean) => {
      try {
        if (next) localStorage.removeItem(key(docId))
        else localStorage.setItem(key(docId), "1")
      } catch {
        /* a private window: for this visit only */
      }
      for (const l of [...listeners]) l()
    },
    [docId],
  )
  return [shown, set]
}
