"use client"

// What puts a call's effects on its tracks, says when one can't run, and
// makes them lighter when the computer struggles: loaded with the first
// effect someone turns on (useCallEffects), with the processors after it.

import { ToastAction } from "@/components/ui/toast"
import { callToast } from "@/components/livekit/callSurface"
import { sameBackground, type Background, type CallEffects, type NoiseLevel } from "@/lib/calls/processors/effects"
import type { LocalAudioTrack, LocalVideoTrack, Room } from "livekit-client"

/** What the hook shares with its runner: the room, what is on the tracks, and how to say what changed. */
export interface RunnerContext {
  room: Room
  /** The effects chosen now. */
  want: () => CallEffects
  /** Puts the choice back to what the tracks have, when an effect can't run. */
  fellBack: (e: Partial<CallEffects>) => void
  busy: (b: "background" | "noise" | null) => void
  /** Changes the choice, as the strain watch does. */
  choose: { background: (b: Background) => void; noise: (n: NoiseLevel) => void }
  /** Says the strain watch has made the effects lighter (the panel shows it while it holds). */
  lightened: () => void
}

export interface Runner {
  background: (track: LocalVideoTrack, b: Background) => Promise<void>
  noise: (track: LocalAudioTrack, n: NoiseLevel) => Promise<void>
  /** Watches for a struggling computer while an effect is on; returns the way to stop. */
  watch: () => () => void
}

export function makeRunner(ctx: RunnerContext): Runner {
  const onTrack: { background: Background; noise: NoiseLevel } = { background: { kind: "none" }, noise: "standard" }
  const frames: { avg: number | null } = { avg: null }
  const onFrame = (ms: number) => {
    if (!Number.isFinite(ms) || ms < 0) return
    frames.avg = frames.avg === null ? ms : frames.avg * 0.9 + ms * 0.1
  }

  const background = async (track: LocalVideoTrack, b: Background) => {
    if (sameBackground(onTrack.background, b) && (b.kind === "none" || track.getProcessor())) return
    ctx.busy("background")
    try {
      const { applyBackground } = await import("@/lib/calls/processors/background")
      await applyBackground(track, b, { onFrame })
      onTrack.background = b
    } catch (e) {
      // The camera shows the room as it is: say so, and offer to turn it off.
      callToast({
        title: "Your background effect couldn't start",
        description: `${(e as Error).message || "Try again."} People see your room as it is.`,
        variant: "destructive",
        action: (
          <ToastAction altText="Turn your camera off" onClick={() => void ctx.room.localParticipant.setCameraEnabled(false)}>
            Turn camera off
          </ToastAction>
        ),
      })
      ctx.fellBack({ background: onTrack.background })
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
          if (!sameBackground(step.next.background, now.background)) ctx.choose.background(step.next.background)
          if (step.next.noise !== now.noise) ctx.choose.noise(step.next.noise)
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

  return { background, noise, watch }
}
