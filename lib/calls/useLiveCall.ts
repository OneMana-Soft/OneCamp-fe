"use client"

import { useEffect } from "react"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { CALL_STATE_EVENT } from "@/lib/calls/stateEvent"
import { callCurrentPath, callReadKeyOf, type CallRef } from "@/lib/calls/callRef"
import type { CallSessionRead } from "@/components/livekit/callState"

/** A member's read of a call (GET /calls/current), read again on the call's own state messages. One hook for the green room, a huddle's post and a board. */
export function useLiveCall(
  ref: CallRef | null,
  refreshInterval: number | ((latest?: { data?: CallSessionRead }) => number) = 0,
): CallSessionRead | undefined {
  const key = callCurrentPath(ref)
  const { data, mutate } = useFetch<{ data?: CallSessionRead }>(key, undefined, { refreshInterval }, OWN_ERRORS)
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
