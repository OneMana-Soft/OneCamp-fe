"use client"

// The green room's effects: the same choices as the call's, shown on the
// preview before Join, and kept for the call that follows (the call's own
// hook reads them from this device as its camera and microphone publish).

import { useCallback, useEffect, useMemo, useState } from "react"
import type { LocalTrack, LocalVideoTrack } from "livekit-client"
import { NO_EFFECTS, cameraOn, readEffects, settersFor, writeEffects, type CallEffects } from "@/lib/calls/processors/effects"
import type { CallEffectsControl } from "./useCallEffects"

export function useGreenRoomEffects(preview: LocalTrack | undefined): CallEffectsControl & { problem: string | null } {
  const [effects, setEffects] = useState<CallEffects>(() => (typeof window === "undefined" ? NO_EFFECTS : readEffects()))
  const [busy, setBusy] = useState<CallEffectsControl["busy"]>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // The preview shows the camera's look chosen, as the call will send it.
  const { background, touchUp, lowLight } = effects
  useEffect(() => {
    if (!preview) return
    const look = { background, touchUp, lowLight }
    if (!cameraOn(look) && !preview.getProcessor()) return
    let live = true
    setBusy("camera")
    void import("@/lib/calls/processors/background")
      .then((m) => m.applyCamera(preview as LocalVideoTrack, look))
      .then(() => live && setProblem(null))
      .catch((e: unknown) => live && setProblem(`${(e as Error).message || "Your camera effect couldn't start."} People would see your room as it is.`))
      .finally(() => live && setBusy(null))
    return () => {
      live = false
    }
  }, [preview, background, touchUp, lowLight])

  // Every choice is kept for the call. The microphone's level is put on in
  // the call: the green room's meter reads the microphone itself.
  const change = useCallback(
    (part: Partial<CallEffects>) =>
      setEffects((cur) => {
        const next = { ...cur, ...part }
        writeEffects(next)
        return next
      }),
    [],
  )
  const set = useMemo(() => settersFor(change), [change])

  return useMemo(() => ({ effects, ...set, busy, problem }), [effects, set, busy, problem])
}
