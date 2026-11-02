"use client"

/**
 * Someone else on a document (V-286): any tab but this one, named or not: a member, this person's own other tab,
 * or a share link's guest. A guest who may only look says nothing of themselves, and the collaboration service
 * passes their tab on as an empty state (other-services/collaboration-service/presenceGuard.js), so the list of
 * who's here (presence/people) never names them; their tab is still on the document, and a board's Bring everyone
 * here reaches it. A leaf: a board's lazy facilitation bar reads it without the people rules.
 */

import * as React from "react"
import type { AwarenessLike } from "./live"

type Tabs = Pick<AwarenessLike, "clientID" | "getStates" | "on" | "off">

/** Whether any tab but `self` is in `states`. */
export function othersOn(states: ReadonlyMap<number, unknown>, self: number): boolean {
  for (const client of states.keys()) if (client !== self) return true
  return false
}

/** Whether anyone else is on the document now, read again on each change of who is on it; false with no awareness. */
export function useOthersHere(awareness: Tabs | null | undefined): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (!awareness) return () => {}
      awareness.on("change", onChange)
      return () => awareness.off("change", onChange)
    },
    [awareness],
  )
  return React.useSyncExternalStore(subscribe, () => (awareness ? othersOn(awareness.getStates(), awareness.clientID) : false), () => false)
}
