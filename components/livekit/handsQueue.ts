"use client"

import * as React from "react"

/** The call's raised hands in the queue's order, for the tiles' badges. */
export const HandsQueueContext = React.createContext<readonly string[]>([])

/** Someone's place in the queue, 1 for next, or null with their hand down. */
export function useHandPlace(identity: string): number | null {
  const i = React.useContext(HandsQueueContext).indexOf(identity)
  return i < 0 ? null : i + 1
}
