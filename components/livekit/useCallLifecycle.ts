"use client"

// One call's life on a page, from the green room to the end (calls audit):
// the channel, DM and group page, the instant meeting's page and the guest
// link each wrote it out, and a fourth surface would have copied it again.
// The seed of A1's useCallSession. The page keeps only how it mints a token.

import { useCallback, useEffect, useRef, useState } from "react"
import type { CallEnd } from "./VideoConference"
import { joinLanguage } from "./callState"
import { warmCall } from "./LazyCall"
import { stopGiven, type GreenRoomTracks } from "./greenRoomHandOver"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { useWhenIdle } from "@/hooks/useWhenIdle"

export type CallPhase = "prejoin" | "joining" | "in-call" | "left" | "removed" | "failed"

export interface CallChoice {
  audio: boolean
  video: boolean
  /** The camera and microphone the green room handed the call at Join, for it to send (greenRoomHandOver). */
  tracks?: GreenRoomTracks
}

/** Thrown by a mint that has already shown its own outcome (a dead guest link): nothing is said under Join. */
export class JoinHandled extends Error {}

export interface CallLifecycle {
  phase: CallPhase
  token: string
  /** The green room's choice, carried into the call (CALL-BUG-1). */
  choice: CallChoice
  /** Why the last join didn't happen, said under Join. */
  joinError?: string
  end?: CallEnd
  /** How long the call lasted, for "You left"; only a call that connected has one (CALL-BUG-23). */
  minutes?: number
  join(c: { audioEnabled: boolean; videoEnabled: boolean }): void
  /** Join again with the same choice (Try again). */
  retry(): void
  onConnected(): void
  onDisconnect(end?: CallEnd): void
  /** Back to the green room. */
  reset(): void
}

export function useCallLifecycle(
  mint: (c: CallChoice & { language?: string }) => Promise<string>,
  start?: { token: string; choice: CallChoice },
): CallLifecycle {
  const [phase, setPhase] = useState<CallPhase>(start?.token ? "in-call" : "prejoin")
  const [token, setToken] = useState(start?.token ?? "")
  const [choice, setChoice] = useState<CallChoice>(start?.choice ?? { audio: true, video: true })
  // The latest choice, for the ends below: from Join the tracks it carries are
  // the call's to stop. LiveKit stops what the call sent; this stops the rest.
  const choiceRef = useRef(choice)
  useEffect(() => () => stopGiven(choiceRef.current.tracks), [])
  const [joinError, setJoinError] = useState<string | undefined>()
  const [end, setEnd] = useState<CallEnd | undefined>()
  const [minutes, setMinutes] = useState<number | undefined>()
  const joinedAt = useRef<number | null>(null)
  const mintRef = useRef(mint)
  mintRef.current = mint
  // The call's code comes after the green room (LazyCall): fetched once the page is idle, and on Join.
  useWhenIdle(() => void warmCall())

  const begin = useCallback((c: CallChoice) => {
    setChoice(c)
    choiceRef.current = c
    setJoinError(undefined)
    setEnd(undefined)
    setPhase("joining")
    joinedAt.current = null
    void warmCall()
    mintRef
      .current({ audio: c.audio, video: c.video, language: joinLanguage() })
      .then((t) => {
        if (!t) throw new Error("The call server didn't answer. Try again.")
        setToken(t)
        setPhase("in-call")
      })
      .catch((e: unknown) => {
        // No call to take them: the green room that gave them shows them
        // again, or, if it has gone, nobody would, so they are stopped.
        if (!c.tracks?.greenRoomOpen?.()) stopGiven(c.tracks)
        setPhase("prejoin")
        if (!(e instanceof JoinHandled)) setJoinError(apiErrorMessage(e, "Try again in a moment."))
      })
  }, [])

  const join = useCallback(
    (c: { audioEnabled: boolean; videoEnabled: boolean; tracks?: GreenRoomTracks }) => begin({ audio: c.audioEnabled, video: c.videoEnabled, tracks: c.tracks }),
    [begin],
  )
  // Again after a failed call: the tracks it was handed went with it, so the call opens its own.
  const retry = useCallback(() => begin({ audio: choice.audio, video: choice.video }), [begin, choice])
  const onConnected = useCallback(() => {
    joinedAt.current = Date.now()
  }, [])
  const onDisconnect = useCallback((e?: CallEnd) => {
    stopGiven(choiceRef.current.tracks)
    setToken("")
    setEnd(e)
    if (e?.removed) return setPhase("removed")
    if (e?.failed) return setPhase("failed")
    // Left before it connected: back to the green room, never "You left".
    if (joinedAt.current === null) return setPhase("prejoin")
    setMinutes(Math.max(1, Math.round((Date.now() - joinedAt.current) / 60000)))
    setPhase("left")
  }, [])
  const reset = useCallback(() => {
    setEnd(undefined)
    setPhase("prejoin")
  }, [])

  return { phase, token, choice, joinError, end, minutes, join, retry, onConnected, onDisconnect, reset }
}
