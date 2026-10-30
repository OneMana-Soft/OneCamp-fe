"use client"

/**
 * Your hand and feedback in a call (calls CALLS-3a), as the server tells the
 * room (lib/calls/handsCore). What changes them, and the lowering of a hand
 * once you've spoken, load the first time they're used (handsRunner).
 */

import * as React from "react"
import { ParticipantEvent, type LocalParticipant } from "livekit-client"
import { feedbackOf, handOf, type CallFeedback } from "@/lib/calls/handsCore"
import type { Asker } from "./handsRunner"

const runner = () => import("./handsRunner")

export interface Hands {
  raisedAt: number | null
  feedback: CallFeedback | null
  /** Absent where you can't reach the server. */
  toggleHand?: () => void
  setFeedback?: (f: CallFeedback | null) => void
}

export function useHands(me: LocalParticipant, asker: Asker | undefined): Hands {
  const read = React.useCallback(() => ({ raisedAt: handOf(me.attributes), feedback: feedbackOf(me.attributes) }), [me])
  const [state, setState] = React.useState(read)
  React.useEffect(() => {
    // The same hand and feedback keep the same state: nothing to draw again.
    const update = () => setState((s) => {
      const n = read()
      return n.raisedAt === s.raisedAt && n.feedback === s.feedback ? s : n
    })
    update()
    me.on(ParticipantEvent.AttributesChanged, update)
    return () => {
      me.off(ParticipantEvent.AttributesChanged, update)
    }
  }, [me, read])

  const { raisedAt } = state
  React.useEffect(() => {
    if (raisedAt === null || !asker) return
    let stop: (() => void) | undefined
    let live = true
    void runner().then((m) => {
      if (live) stop = m.lowerWhenSpoken(asker, me, raisedAt)
    })
    return () => {
      live = false
      stop?.()
    }
  }, [raisedAt, asker, me])

  const toggleHand = React.useCallback(() => {
    if (asker) void runner().then((m) => m.toggleHand(asker, raisedAt !== null))
  }, [asker, raisedAt])
  const setFeedback = React.useCallback(
    (f: CallFeedback | null) => {
      if (asker) void runner().then((m) => m.setFeedback(asker, f))
    },
    [asker],
  )
  return { ...state, toggleHand: asker ? toggleHand : undefined, setFeedback: asker ? setFeedback : undefined }
}
