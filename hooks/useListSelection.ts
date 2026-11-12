"use client"

import { createContext, useContext, useSyncExternalStore } from "react"
import type { SelectionStore } from "@/lib/listSelection"

/** The selection of the list a row or card is in (components/task/KeyboardList). */
export const ListSelectionContext = createContext<SelectionStore | null>(null)

const noStore = () => () => {}

/**
 * Whether this task is selected: a key press that picks or unpicks re-renders
 * the rows it changes and no other. The highlight (the keys' place) is no
 * state of a row: hooks/useListKeyboard paints it on the row as
 * data-highlighted="true", and a row's look for it is CSS on that attribute
 * (the lit: variant, app/globals.css), so J and K draw no row.
 */
export function useRowSelected(id: string): boolean {
  const store = useContext(ListSelectionContext)
  return useSyncExternalStore(store?.subscribe ?? noStore, () => !!store?.get().selected.has(id), () => false)
}

/** The selected tasks' ids (a new set only when the selection changes). */
export function useSelectedIds(store: SelectionStore | null): ReadonlySet<string> {
  return useSyncExternalStore(store?.subscribe ?? noStore, () => store?.get().selected ?? EMPTY, () => EMPTY)
}
const EMPTY: ReadonlySet<string> = new Set()
