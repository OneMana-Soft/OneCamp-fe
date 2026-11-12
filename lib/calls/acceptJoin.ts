import { useSyncExternalStore } from "react"

// Accept on a ring (slack-06 H2) names its call's door here, in memory only:
// no address or reload can join anybody. That door's call view, open or
// opening, sees it and only then loads the join (components/calls/AcceptJoin).
// The ring host and the join change it (lib/calls/accepting); a page reads it.

/** The door Accept's join waits at or is under way at ("" for none), and who watches it. */
export const acceptDoor = { at: "", seen: new Set<() => void>() }
const watch = (f: () => void) => (acceptDoor.seen.add(f), () => void acceptDoor.seen.delete(f))

/** Whether Accept's join waits at this door, or is under way there. */
export const useAccepted = (at: string) => useSyncExternalStore(watch, () => acceptDoor.at === at, () => false)
