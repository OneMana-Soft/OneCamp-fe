"use client"

// What a tree's rows read of the tree (fluid-06, Fix 1): which row has
// focus, which are open, which levels show whole, the current place, where a
// drag would land, files over a row, which row's menu is open, which rows are
// chosen. Kept out of React's state at the tree's root, where every change
// rendered every row again (about 5,000 renders a down-arrow on a tree of
// 2,281 pages): each row reads its own booleans through useTreeSelect, and
// only the rows whose boolean changed render.

import { useSyncExternalStore } from "react"

import type { DropZone } from "@/components/tree/treeDnd"

export interface TreeStoreState {
  focused: string | null
  open: ReadonlySet<string>
  /** Levels shown whole ("Show N more"), by parent ("" for the top). */
  showAll: ReadonlySet<string>
  /** The thing on screen: its row is the current place. */
  active: string | null
  /** Where a row being dragged would land. */
  over: { id: string; zone: DropZone } | null
  /** The row files dragged in from outside would land in. */
  filesOver: string | null
  /** The row whose menu is open. */
  menuFor: string | null
  selected: ReadonlySet<string>
  /** Rows are being chosen: every row shows its box. */
  selecting: boolean
  /** Said after a move ("Moved Plans"). */
  announcement: string
}

export interface TreeStore {
  get(): TreeStoreState
  /** Changes what changed; listeners hear only a real change. */
  set(patch: Partial<TreeStoreState>): void
  subscribe(listener: () => void): () => void
}

const EMPTY: ReadonlySet<string> = new Set()

export function createTreeStore(initial: Partial<TreeStoreState> = {}): TreeStore {
  let state: TreeStoreState = {
    focused: null,
    open: EMPTY,
    showAll: EMPTY,
    active: null,
    over: null,
    filesOver: null,
    menuFor: null,
    selected: EMPTY,
    selecting: false,
    announcement: "",
    ...initial,
  }
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    set(patch) {
      let changed = false
      for (const k of Object.keys(patch) as Array<keyof TreeStoreState>) {
        if (patch[k] !== state[k]) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...patch }
      for (const l of [...listeners]) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * One thing read from a tree's store: the component renders again only when
 * it changes. select must answer a boolean, a string or another value that
 * stays the same object while unchanged.
 */
export function useTreeSelect<T>(store: TreeStore, select: (s: TreeStoreState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}
