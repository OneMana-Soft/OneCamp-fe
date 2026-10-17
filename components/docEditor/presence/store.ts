/**
 * Who is in a doc, by awareness client (B8), for the stack and the meta line.
 * fromTheStart.ts fills it, from each doc editor's first moment; the doc's
 * page loads this file, so it stays small.
 */
import * as React from "react"

export interface PresencePerson {
  /** Their awareness clients (a tab each), the one active last first. */
  clients: number[]
  name: string
  mode?: "editing" | "viewing"
  /** No input for 2 minutes in any of their tabs. */
  idle: boolean
}

export interface DocPresence {
  /** By user id. */
  people: Record<string, PresencePerson>
  /** The last edit someone else made, as this tab saw it. */
  edit: { userId: string; name: string; at: number } | null
  /** Who this tab is. */
  self: string | null
}

/** How someone is here, as their face and their row say it. */
export function stateOf(p: PresencePerson | undefined, mode?: string): string | undefined {
  return p?.idle ? "idle" : (p?.mode ?? mode)
}

const docs = new Map<string, DocPresence>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function setPresence(docId: string, p: DocPresence | null): void {
  if (p) docs.set(docId, p)
  else docs.delete(docId)
  listeners.forEach((l) => l())
}

export function usePresence(docId: string): DocPresence | undefined {
  return React.useSyncExternalStore(subscribe, () => docs.get(docId), () => undefined)
}
