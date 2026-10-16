"use client"

import { useEffect, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

/**
 * The name a page gives itself for the browser tab, when the sidebar doesn't
 * know it: a task, a goal, a table. The page says it with usePageName while
 * it is open; DocumentTitle reads it for that address only (pageTitle), so a
 * name never outlives its page. A task's page read "Task · OneCamp" and a
 * goal's "OneCamp" (PTC-38).
 */
let named: { path: string; name: string } | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Names the page now open, while it is; nothing for an empty name. */
export function usePageName(name: string | null | undefined): void {
  const path = usePathname() ?? ""
  const value = name?.trim() ?? ""
  useEffect(() => {
    if (!value) return
    const mine = { path, name: value }
    named = mine
    emit()
    return () => {
      if (named === mine) {
        named = null
        emit()
      }
    }
  }, [path, value])
}

/** The name the page at this address gave itself, if it did. */
export function usePageNameFor(path: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (named?.path === path ? named.name : undefined),
    () => undefined,
  )
}
