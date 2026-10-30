"use client"

// Several rows of a tree chosen at once (docs F1: colour or move a
// selection), for any kind of tree. What is chosen is the lists' own
// selection (lib/listSelection, a run by lib/listKeys rangeOf), so a tree
// chooses as a task list does; selection mode, where a tap chooses a row
// rather than opening it (a phone's "Select"), is the tree's own. A row that
// leaves the screen (its folder shut, removed in another tab) leaves the
// selection: what is chosen is only ever what is in sight.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { onEscape } from "@/lib/keys/onEscape"
import { rangeOf } from "@/lib/listKeys"
import { createSelectionStore } from "@/lib/listSelection"

/** How a row is chosen: on its own toggled, or the run from the last one chosen to it. */
export type SelectHow = "toggle" | "range"

/** A tree's selection, as TreeView takes it. */
export interface TreeSelection {
  selected: ReadonlySet<string>
  /** A row chosen; visible is the rows on screen, in order. */
  onSelect: (id: string, how: SelectHow, visible: readonly string[]) => void
  /** A row has left the screen: it leaves the selection. */
  gone: (id: string) => void
  /** Let go of every row, and leave selection mode. */
  clear: () => void
  /** A tap chooses a row rather than opening it. */
  mode: boolean
  setMode: (on: boolean) => void
}

export function useTreeSelection(): TreeSelection {
  const [store] = useState(createSelectionStore)
  const selected = useSyncExternalStore(store.subscribe, () => store.get().selected, () => store.get().selected)
  const [mode, setMode] = useState(false)

  const onSelect = useCallback(
    (id: string, how: SelectHow, visible: readonly string[]) => {
      if (how === "toggle") store.toggle(id)
      else store.addRun(rangeOf([...visible], store.get().anchor ?? id, id), id)
    },
    [store],
  )

  const gone = useCallback(
    (id: string) => {
      const now = store.get().selected
      if (now.has(id)) store.keepOnly(new Set([...now].filter((other) => other !== id)))
    },
    [store],
  )

  const clear = useCallback(() => {
    store.clear()
    setMode(false)
  }, [store])

  // Escape lets go of them, as the page's own state (lib/keys/escape's page layer).
  const any = selected.size > 0 || mode
  useEffect(() => (any ? onEscape("page", () => clear()) : undefined), [any, clear])

  return useMemo(() => ({ selected, onSelect, gone, clear, mode, setMode }), [selected, onSelect, gone, clear, mode])
}
