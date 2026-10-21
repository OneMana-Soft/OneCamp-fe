"use client"

// The green room's effects: the same choices as the call's, shown on the
// preview before Join, and kept for the call that follows (the call's own
// hook reads them from this device as its camera and microphone publish).

import { useCallback, useEffect, useMemo, useState } from "react"
import type { LocalTrack, LocalVideoTrack } from "livekit-client"
import { NO_EFFECTS, readEffects, writeEffects, type Background, type CallEffects, type NoiseLevel } from "@/lib/calls/processors/effects"
import type { CallEffectsControl } from "./useCallEffects"

export function useGreenRoomEffects(preview: LocalTrack | undefined): CallEffectsControl & { problem: string | null } {
  const [effects, setEffects] = useState<CallEffects>(() => (typeof window === "undefined" ? NO_EFFECTS : readEffects()))
  const [busy, setBusy] = useState<CallEffectsControl["busy"]>(null)
  const [problem, setProblem] = useState<string | null>(null)

  // The preview shows the background chosen, as the call will.
  useEffect(() => {
    if (!preview) return
    const b = effects.background
    if (b.kind === "none" && !preview.getProcessor()) return
    let live = true
    setBusy("background")
    void import("@/lib/calls/processors/background")
      .then((m) => m.applyBackground(preview as LocalVideoTrack, b))
      .then(() => live && setProblem(null))
      .catch((e: unknown) => live && setProblem(`${(e as Error).message || "Your background effect couldn't start."} People would see your room as it is.`))
      .finally(() => live && setBusy(null))
    return () => {
      live = false
    }
  }, [preview, effects.background])

  const setBackground = useCallback((b: Background) => {
    setEffects((cur) => {
      const next = { ...cur, background: b }
      writeEffects(next)
      return next
    })
  }, [])
  // The microphone's level is put on in the call: the green room's meter reads the microphone itself.
  const setNoise = useCallback((n: NoiseLevel) => {
    setEffects((cur) => {
      const next = { ...cur, noise: n }
      writeEffects(next)
      return next
    })
  }, [])

  return useMemo(() => ({ effects, setBackground, setNoise, busy, problem }), [effects, setBackground, setNoise, busy, problem])
}
