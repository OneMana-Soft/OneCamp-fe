"use client"

// A member's read of the call going on in a conversation or an instant
// meeting (Call State, GET /calls/current), for the green room and for what
// whoever runs the call does to it. One hook, so the channel, DM and group
// pages and the instant meeting's page read it alike.

import { useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { CALL_STATE_EVENT } from "@/lib/calls/stateEvent"
import { callCurrentPath, callReadKeyOf, type CallRef } from "@/services/callService"
import type { CallSessionRead } from "./callState"

/**
 * The call as its people read it (Call State): before joining, whether it is
 * recorded or captioned, and by whom, so the green room can say so before
 * Join (CALL-BUG-12), who is in it, and why it won't let you in now (locked,
 * or a host put you out); in it, the call's id, for what whoever runs it does
 * to it. Kept fresh while the green room is open, since a recording or a lock
 * can start while someone decides, and read again until the call's id is
 * known once you are in (the first person in opens the call as they connect).
 */
export function useCallSession(ref: CallRef | null, phase: "waiting" | "in-call" | "over"): CallSessionRead | undefined {
  const refreshInterval = (latest?: { data?: CallSessionRead }) =>
    phase === "waiting" ? 10_000 : phase === "in-call" && !latest?.data?.session?.id ? 2_000 : 0
  const key = callCurrentPath(ref)
  const { data, mutate } = useFetch<{ data?: CallSessionRead }>(key, undefined, { refreshInterval }, OWN_ERRORS)
  // The server says when this call changes (MESSAGE_CALL_STATE, passed on by
  // the app's MQTT handler): read it again then, not at the next poll.
  useEffect(() => {
    if (!key) return
    const onState = (e: Event) => {
      if (callReadKeyOf((e as CustomEvent).detail) === key) void mutate()
    }
    window.addEventListener(CALL_STATE_EVENT, onState)
    return () => window.removeEventListener(CALL_STATE_EVENT, onState)
  }, [key, mutate])
  return data?.data
}
