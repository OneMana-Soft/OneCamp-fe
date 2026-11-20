"use client"

import { useEffect, useSyncExternalStore } from "react"

import { heldOnServer, holdStore } from "@/lib/holdStore"

/**
 * Who has the connection pill's place (components/error/OfflineNotice) besides
 * its floating copy: a shell that hosts it, or a phone notice that stands in for
 * it. Its own module, so a stand-in brings none of the pill's code.
 */

type Place = ReturnType<typeof holdStore>
const hosts = holdStore()
const standIns = holdStore()
const claims = holdStore()
const yielding = holdStore()
const useHold = (place: Place, active: boolean) => useEffect(() => (active ? place.hold() : undefined), [place, active])
const useHeld = (place: Place): boolean => useSyncExternalStore(place.subscribe, place.held, heldOnServer)

/** For a shell that draws the pill itself (FootPill): while it's mounted, the root's floating copy stands down. */
export function useHostPill() {
  useHold(hosts, true)
}

/** Whether a shell draws the pill now. */
export const usePillHosted = (): boolean => useHeld(hosts)

/**
 * While `active`, the caller says what the pill would, where a phone draws it.
 * A doc's or a board's save notice (V-21, V-45) is the app's toast, which a
 * phone shows centred just above the screen's foot, on the pill's spot, so the
 * pill showed under it (DESIGN-BUILD-29 M1): the root's copy steps aside on a
 * phone until the caller is done. A wider screen keeps it, bottom-left, with
 * the toasts bottom-right.
 */
export function useStandInForPill(active: boolean) {
  useHold(standIns, active)
}

/** Whether a notice stands in for the pill now. */
export const usePillStoodIn = (): boolean => useHeld(standIns)

/**
 * While `active`, the page says it's offline itself (V-695): the pill shows only what waits, quietly.
 * One voice a page: a claim that `yields` (a save dot) speaks only while no other (a doc's pill) holds. Says if the caller speaks.
 */
export function useClaimOffline(active: boolean, { yields = false } = {}): boolean {
  useHold(yields ? yielding : claims, active)
  const outspoken = useHeld(claims)
  return active && !(yields && outspoken)
}

/** Whether a page says it's offline itself now. */
export function useOfflineClaimed(): boolean {
  const outspoken = useHeld(claims)
  return useHeld(yielding) || outspoken
}
