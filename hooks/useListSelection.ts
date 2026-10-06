"use client"

import { createContext, useContext, useSyncExternalStore } from "react"
import type { SelectionStore } from "@/lib/listSelection"

/** The selection of the list a row or card is in (components/task/KeyboardList). */
export const ListSelectionContext = createContext<SelectionStore | null>(null)

const noStore = () => () => {}

/**
 * Whether this task is highlighted and whether it is selected. Read as one
 * number, so a key press re-renders the two rows it changes and no other.
 */
export function useRowState(id: string): { highlighted: boolean; selected: boolean } {
  const store = useContext(ListSelectionContext)
  const bits = useSyncExternalStore(
    store?.subscribe ?? noStore,
    () => (store ? (store.get().highlighted === id ? 1 : 0) | (store.get().selected.has(id) ? 2 : 0) : 0),
    () => 0,
  )
  return { highlighted: (bits & 1) === 1, selected: (bits & 2) === 2 }
}

/** The selected tasks' ids (a new set only when the selection changes). */
export function useSelectedIds(store: SelectionStore | null): ReadonlySet<string> {
  return useSyncExternalStore(store?.subscribe ?? noStore, () => store?.get().selected ?? EMPTY, () => EMPTY)
}
const EMPTY: ReadonlySet<string> = new Set()
