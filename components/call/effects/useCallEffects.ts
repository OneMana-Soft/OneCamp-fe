"use client"

// The effects someone chose (lib/calls/processors), on their camera and
// microphone in a call: put on as each one is published, changed from the
// Effects panel, made lighter when the computer struggles, and said in words
// when one can't run. This hook only holds the choice and watches the
// tracks; the runner that does the work (effectsRunner.tsx) and the
// processors behind it load with the first effect someone turns on, so a
// call with none costs nothing for them.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ParticipantEvent, Track, type LocalAudioTrack, type LocalTrackPublication, type LocalVideoTrack, type Room } from "livekit-client"
import { NO_EFFECTS, cameraOn, lookOf, readEffects, sameLook, settersFor, writeEffects, type Background, type CallEffects, type NoiseLevel, type TouchUp } from "@/lib/calls/processors/effects"
import type { Runner, RunnerContext } from "./effectsRunner"

export interface CallEffectsControl {
  effects: CallEffects
  setBackground: (b: Background) => void
  setNoise: (n: NoiseLevel) => void
  setTouchUp: (t: TouchUp) => void
  setLowLight: (on: boolean) => void
  /** Which effect is being put on now: the camera's look, or the microphone's. */
  busy: "camera" | "noise" | null
  /** Whether the CPU watch has made the effects lighter, until the person chooses again. */
  lightened?: boolean
}

const cameraOf = (room: Room) => room.localParticipant.getTrackPublication?.(Track.Source.Camera)?.track as LocalVideoTrack | undefined
const micOf = (room: Room) => room.localParticipant.getTrackPublication?.(Track.Source.Microphone)?.track as LocalAudioTrack | undefined

/** Whether a choice has anything for the runner to do. Pure. */
export const anyEffect = (e: CallEffects) => cameraOn(lookOf(e)) || e.noise !== "standard"

export function useCallEffects(room: Room): CallEffectsControl {
  const [effects, setEffects] = useState<CallEffects>(() => (typeof window === "undefined" ? NO_EFFECTS : readEffects()))
  const [busy, setBusy] = useState<CallEffectsControl["busy"]>(null)
  const [lightened, setLightened] = useState(false)
  const want = useRef(effects)
  want.current = effects

  const choose = useRef<RunnerContext["choose"]>(() => undefined)
  const runner = useRef<Promise<Runner> | null>(null)
  const run = useCallback((): Promise<Runner> => {
    runner.current ??= import("./effectsRunner").then((m) =>
      m.makeRunner({
        room,
        want: () => want.current,
        fellBack: (e) => setEffects((cur) => ({ ...cur, ...e })),
        busy: setBusy,
        choose: (e) => choose.current(e),
        lightened: () => setLightened(true),
      }),
    )
    return runner.current
  }, [room])

  // Each track as it is published (and those already there), with what was
  // chosen. With nothing chosen, nothing loads.
  useEffect(() => {
    runner.current = null
    const lp = room.localParticipant
    const onPublished = (pub: LocalTrackPublication) => {
      if (!pub.track || (!anyEffect(want.current) && !runner.current)) return
      if (pub.source === Track.Source.Camera) void run().then((r) => r.camera(pub.track as LocalVideoTrack, lookOf(want.current)))
      if (pub.source === Track.Source.Microphone) void run().then((r) => r.noise(pub.track as LocalAudioTrack, want.current.noise))
    }
    lp.on(ParticipantEvent.LocalTrackPublished, onPublished)
    for (const pub of lp.trackPublications?.values() ?? []) onPublished(pub as LocalTrackPublication)
    return () => {
      lp.off(ParticipantEvent.LocalTrackPublished, onPublished)
    }
  }, [room, run])

  // A choice, from the panel or the strain watch: remembered, and put on the
  // live camera or microphone where it changes what they carry.
  const change = useCallback(
    (part: Partial<CallEffects>) => {
      setLightened(false)
      const was = want.current
      const next = { ...was, ...part }
      want.current = next
      writeEffects(next)
      setEffects(next)
      const camera = cameraOf(room)
      const look = lookOf(next)
      if (camera && !sameLook(lookOf(was), look) && (cameraOn(look) || runner.current)) void run().then((r) => r.camera(camera, look))
      const mic = micOf(room)
      if (mic && was.noise !== next.noise && (next.noise !== "standard" || runner.current)) void run().then((r) => r.noise(mic, next.noise))
    },
    [room, run],
  )
  choose.current = change
  const set = useMemo(() => settersFor(change), [change])

  // The strain watch, while something heavy is on.
  const heavy = cameraOn(lookOf(effects)) || effects.noise === "strong"
  useEffect(() => {
    if (!heavy) return
    let stop: (() => void) | null = null
    let live = true
    void run().then((r) => {
      if (live) stop = r.watch()
    })
    return () => {
      live = false
      stop?.()
    }
  }, [heavy, run])

  return useMemo(() => ({ effects, ...set, busy, lightened }), [effects, set, busy, lightened])
}
