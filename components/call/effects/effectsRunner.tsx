"use client"

// What puts a call's effects on its tracks, says when one can't run, and
// makes them lighter when the computer struggles: loaded with the first
// effect someone turns on (useCallEffects), with the processors after it.

import { ToastAction } from "@/components/ui/toast"
import { callToast } from "@/components/livekit/callSurface"
import { NO_EFFECTS, cameraOn, lookOf, sameLook, type CallEffects, type CameraLook, type NoiseLevel } from "@/lib/calls/processors/effects"
import type { LocalAudioTrack, LocalVideoTrack, Room } from "livekit-client"

/** What the hook shares with its runner: the room, what is on the tracks, and how to say what changed. */
export interface RunnerContext {
  room: Room
  /** The effects chosen now. */
  want: () => CallEffects
  /** Puts the choice back to what the tracks have, when an effect can't run. */
  fellBack: (e: Partial<CallEffects>) => void
  busy: (b: "camera" | "noise" | null) => void
  /** Changes the choice, as the strain watch does. */
  choose: (e: Partial<CallEffects>) => void
  /** Says the strain watch has made the effects lighter (the panel shows it while it holds). */
  lightened: () => void
}

export interface Runner {
  /** The camera's look (its background, touch-up and low light), as one processor. */
  camera: (track: LocalVideoTrack, look: CameraLook) => Promise<void>
  noise: (track: LocalAudioTrack, n: NoiseLevel) => Promise<void>
  /** Watches for a struggling computer while an effect is on; returns the way to stop. */
  watch: () => () => void
}

/** The camera's processor's own check (CallEffectsControl.unavailable), imported where the call puts it on. */
export const backgroundUnavailable = () => import("@/lib/calls/processors/background").then((m) => m.backgroundUnavailable())

export function makeRunner(ctx: RunnerContext): Runner {
  const onTrack: { camera: CameraLook; noise: NoiseLevel } = { camera: lookOf(NO_EFFECTS), noise: "standard" }
  const frames: { avg: number | null } = { avg: null }
  const onFrame = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return
    frames.avg = frames.avg === null ? ms : frames.avg * 0.9 + ms * 0.1
  }

  // The browser's graphics were lost: the camera carries on without the touch-up (low light needs no graphics).
  const onLost = () => {
    onTrack.camera = { ...onTrack.camera, touchUp: "off" }
    callToast({ title: "Touch-up stopped", description: "This browser's graphics were reset. Turn the touch-up on again to try.", variant: "destructive" })
    ctx.fellBack({ touchUp: "off" })
  }

  const camera = async (track: LocalVideoTrack, look: CameraLook) => {
    if (sameLook(onTrack.camera, look) && (!cameraOn(look) || track.getProcessor())) return
    ctx.busy("camera")
    try {
      const { applyCamera } = await import("@/lib/calls/processors/background")
      await applyCamera(track, look, { onFrame, onLost })
      onTrack.camera = look
    } catch (e) {
      // The camera shows the room as it is: say so, and offer to turn it off.
      callToast({
        title: "Your camera effect couldn't start",
        description: `${(e as Error).message || "Try again."} ${look.background.kind === "none" ? "People see you as your camera does." : "People see your room as it is."}`,
        variant: "destructive",
        action: (
          <ToastAction altText="Turn your camera off" onClick={() => void ctx.room.localParticipant.setCameraEnabled(false)}>
            Turn camera off
          </ToastAction>
        ),
      })
      ctx.fellBack(onTrack.camera)
    } finally {
      ctx.busy(null)
    }
  }

  const noise = async (track: LocalAudioTrack, n: NoiseLevel) => {
    const was = onTrack.noise
    if (was === n) return
    ctx.busy("noise")
    const fallBack = (why: string) => {
      callToast({ title: "Strong noise reduction is off", description: `${why} Your browser's own noise reduction is on.`, variant: "destructive" })
      ctx.fellBack({ noise: "standard" })
    }
    try {
      const { applyNoise } = await import("@/lib/calls/processors/noise")
      await applyNoise(track, n, was, () => {
        // The call would hear nothing: back to the browser's own.
        void applyNoise(track, "standard", "strong").then(() => (onTrack.noise = "standard"))
        fallBack("It wasn't passing your voice on.")
      })
      onTrack.noise = n
    } catch (e) {
      fallBack((e as Error).message || "It couldn't start here.")
    } finally {
      ctx.busy(null)
    }
  }

  // A struggling computer: something lighter, said; and when nothing is left
  // to take without changing what people see, the person is asked.
  const watch = () => {
    let stop: (() => void) | null = null
    let live = true
    void import("@/lib/calls/processors/strain").then(({ lighter, watchStrain }) => {
      if (!live) return
      stop = watchStrain(() => {
        const now = ctx.want()
        const step = lighter(now)
        if (step) {
          ctx.choose(step.next)
          ctx.lightened()
          callToast({ title: "Effects made lighter", description: step.said })
        } else if (now.background.kind !== "none") {
          callToast({ title: "Your computer is busy", description: "Your background effect is using a lot of it. Turning it off, or your camera, would help the call." })
        }
      }, () => frames.avg)
    })
    return () => {
      live = false
      stop?.()
    }
  }

  return { camera, noise, watch }
}
