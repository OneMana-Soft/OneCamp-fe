"use client"

import { useEffect, useSyncExternalStore } from "react"

import { heldOnServer, holdStore } from "@/lib/holdStore"

/**
 * Who has the connection pill's place (components/error/OfflineNotice) besides
 * its floating copy: a shell that hosts it, or a phone notice that stands in for
 * it. Its own module, so a stand-in brings none of the pill's code.
 */

const hosts = holdStore()
const standIns = holdStore()

/** For a shell that draws the pill itself (FootPill): while it's mounted, the root's floating copy stands down. */
export function useHostPill() {
  useEffect(() => hosts.hold(), [])
}

/** Whether a shell draws the pill now. */
export const usePillHosted = (): boolean => useSyncExternalStore(hosts.subscribe, hosts.held, heldOnServer)

/**
 * While `active`, the caller says what the pill would, where a phone draws it.
 * A doc's or a board's save notice (V-21, V-45) is the app's toast, which a
 * phone shows centred just above the screen's foot, on the pill's spot, so the
 * pill showed under it (DESIGN-BUILD-29 M1): the root's copy steps aside on a
 * phone until the caller is done. A wider screen keeps it, bottom-left, with
 * the toasts bottom-right.
 */
export function useStandInForPill(active: boolean) {
  useEffect(() => (active ? standIns.hold() : undefined), [active])
}

/** Whether a notice stands in for the pill now. */
export const usePillStoodIn = (): boolean => useSyncExternalStore(standIns.subscribe, standIns.held, heldOnServer)
