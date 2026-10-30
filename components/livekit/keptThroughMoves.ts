// What a person chose or was told in a call that a move to or from a breakout
// room keeps (calls package C). A move is a new connection, and the call's
// view under it (VideoConference's LiveKitRoom, keyed by the move) mounts
// again; none of this is the room's, so it lives with the call instead.
// Found on the live walk of 28 Oct: the call's clock started again at 0:00 in
// each room, a captions notice already dismissed came back, "Stop captioning
// me" was forgotten, and the host's rooms panel could no longer name anyone
// who had gone to a room.

import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"

/** Someone this screen has seen in the call: who they are, and the name it showed. */
export interface SeenPerson {
  identity: string
  name: string
}

export interface KeptThroughMoves {
  /** When this person joined the call: the place pill's clock, which a move doesn't start again. */
  joinedAt: number
  /** The captions session (its `since`) whose notice this person dismissed. */
  noticeDismissed: number | null
  setNoticeDismissed: Dispatch<SetStateAction<number | null>>
  /** "Stop captioning me": this person's own browser doesn't listen, in any room of the call. */
  notMe: boolean
  setNotMe: Dispatch<SetStateAction<boolean>>
  /** The captions session whose captions this person hid; captions come back with the next session. */
  hiddenFor: number | null
  setHiddenFor: Dispatch<SetStateAction<number | null>>
  /**
   * Everyone this screen has seen in the call, by identity. Someone in
   * another room isn't in yours, so their name is the one from when they
   * were.
   */
  seen: Map<string, SeenPerson>
}

/** The call's own keeping, for the call's view to take through every move. */
export function useKeptThroughMoves(): KeptThroughMoves {
  const [joinedAt] = useState(() => Date.now())
  const [noticeDismissed, setNoticeDismissed] = useState<number | null>(null)
  const [notMe, setNotMe] = useState(false)
  const [hiddenFor, setHiddenFor] = useState<number | null>(null)
  const seen = useRef(new Map<string, SeenPerson>()).current
  return useMemo(
    () => ({ joinedAt, noticeDismissed, setNoticeDismissed, notMe, setNotMe, hiddenFor, setHiddenFor, seen }),
    [joinedAt, noticeDismissed, notMe, hiddenFor, seen],
  )
}
