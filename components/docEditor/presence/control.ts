/**
 * What the presence overlay of the editor a bus is on does for "Here now":
 * jump to someone's awareness client, follow it. Keyed by the bus, so each
 * editor of a doc in split view follows on its own. A board's adds its
 * signals (components/board/boardSignals, miro-24): a reaction, this tab's
 * hand, and an editor's word to lower someone's.
 */
import * as React from "react"
import type { Reaction } from "@/lib/reactions/set"

export interface PresenceControl {
  jump(clientId: number): boolean
  follow(clientId: number | null): void
  following: number | null
  /** Bring everyone on it to this screen's view once, when this person may (a board's editors, miro-21 1). */
  bringAll?: () => void
  /** Send everyone here a reaction: it rises from this person's face on their screens, and from the React button here. */
  react?: (emoji: Reaction) => void
  /** This tab's hand: whether it is up, and raising or lowering it. */
  hand?: { up: boolean; set(up: boolean): void }
  /** Lower the hand of the person on that tab, when this person may (a board's editors). */
  lower?: (client: number) => void
}

const controls = new Map<string, PresenceControl>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function setPresenceControl(busKey: string, c: PresenceControl | null): void {
  if (c) controls.set(busKey, c)
  else controls.delete(busKey)
  listeners.forEach((l) => l())
}

export function usePresenceControl(busKey: string): PresenceControl | undefined {
  return React.useSyncExternalStore(subscribe, () => controls.get(busKey), () => undefined)
}
