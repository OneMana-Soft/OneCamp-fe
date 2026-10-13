"use client"

// One call's life on a page, from the green room to the end (calls audit):
// the channel, DM and group page, the instant meeting's page and the guest
// link each wrote it out, and a fourth surface would have copied it again.
// The seed of A1's useCallSession. The page keeps only how it mints a token.

import { useCallback, useRef, useState } from "react"
import type { CallEnd } from "./VideoConference"
import { joinLanguage } from "./callState"
import { apiErrorMessage } from "@/lib/utils/apiError"

export type CallPhase = "prejoin" | "joining" | "in-call" | "left" | "removed" | "failed"

export interface CallChoice {
  audio: boolean
  video: boolean
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
  const [joinError, setJoinError] = useState<string | undefined>()
  const [end, setEnd] = useState<CallEnd | undefined>()
  const [minutes, setMinutes] = useState<number | undefined>()
  const joinedAt = useRef<number | null>(null)
  const mintRef = useRef(mint)
  mintRef.current = mint

  const begin = useCallback((c: CallChoice) => {
    setChoice(c)
    setJoinError(undefined)
    setEnd(undefined)
    setPhase("joining")
    joinedAt.current = null
    mintRef
      .current({ ...c, language: joinLanguage() })
      .then((t) => {
        if (!t) throw new Error("The call server didn't answer. Try again.")
        setToken(t)
        setPhase("in-call")
      })
      .catch((e: unknown) => {
        setPhase("prejoin")
        if (!(e instanceof JoinHandled)) setJoinError(apiErrorMessage(e, "Try again in a moment."))
      })
  }, [])

  const join = useCallback((c: { audioEnabled: boolean; videoEnabled: boolean }) => begin({ audio: c.audioEnabled, video: c.videoEnabled }), [begin])
  const retry = useCallback(() => begin(choice), [begin, choice])
  const onConnected = useCallback(() => {
    joinedAt.current = Date.now()
  }, [])
  const onDisconnect = useCallback((e?: CallEnd) => {
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
