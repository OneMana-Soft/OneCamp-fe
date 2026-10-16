/**
 * What the presence overlay of the editor a bus is on does for "Here now":
 * jump to someone's awareness client, follow it. Keyed by the bus, so each
 * editor of a doc in split view follows on its own.
 */
import * as React from "react"

export interface PresenceControl {
  jump(clientId: number): boolean
  follow(clientId: number | null): void
  following: number | null
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
