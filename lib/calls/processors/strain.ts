// Whether this computer is struggling to run a call's effects, so they can
// be made lighter before the call suffers (CL14, AV-18): the Compute Pressure
// API where the browser has it (Chromium), and otherwise how long each video
// frame's effect takes. Says so at most once a minute. Loaded with the first
// effect someone turns on.

import type { CallEffects } from "./effects"

/** A frame's effect taking longer than this, on average, is a computer that can't keep up at 30 frames a second. */
export const FRAME_BUDGET_MS = 24

/** How many checks in a row, 2 s apart, before it counts. */
const SUSTAINED = 3

/** The least time between two notices of strain. */
export const STRAIN_QUIET_MS = 60_000

interface PressureRecordLike {
  state: "nominal" | "fair" | "serious" | "critical"
}
interface PressureObserverLike {
  observe(source: "cpu", options?: { sampleInterval?: number }): Promise<void>
  disconnect(): void
}
type PressureObserverCtor = new (callback: (records: PressureRecordLike[]) => void) => PressureObserverLike

/**
 * Calls `onStrain` when the computer has been struggling for a while: the
 * CPU's pressure serious or critical for three readings, or the frames'
 * effect over budget for three checks. Returns the way to stop watching.
 */
export function watchStrain(onStrain: () => void, frames?: () => number | null, now: () => number = Date.now): () => void {
  let last = -Infinity
  let pressured = 0
  let slow = 0
  const strain = () => {
    if (now() - last < STRAIN_QUIET_MS) return
    last = now()
    pressured = 0
    slow = 0
    onStrain()
  }
  let observer: PressureObserverLike | null = null
  const Pressure = (globalThis as { PressureObserver?: PressureObserverCtor }).PressureObserver
  if (Pressure) {
    try {
      observer = new Pressure((records) => {
        const state = records[records.length - 1]?.state
        pressured = state === "serious" || state === "critical" ? pressured + 1 : 0
        if (pressured >= SUSTAINED) strain()
      })
      observer.observe("cpu", { sampleInterval: 2000 }).catch(() => {
        observer = null
      })
    } catch {
      observer = null
    }
  }
  const timer = frames
    ? setInterval(() => {
        const avg = frames()
        slow = avg !== null && avg > FRAME_BUDGET_MS ? slow + 1 : 0
        if (slow >= SUSTAINED) strain()
      }, 2000)
    : null
  return () => {
    observer?.disconnect()
    if (timer) clearInterval(timer)
  }
}

/**
 * The next lighter way to run an effect when the computer is struggling, or
 * null when there is none left to take.
 * A background is never taken away on its own: it may be what keeps a room
 * private. So a touch-up goes first (smooth, then subtle, then off): it only
 * changes how skin looks. Then strong blur becomes light blur, and strong
 * noise reduction the browser's own, which costs nothing. Low light goes
 * last: it is the cheapest, and it is what lets people see someone in a
 * dark room. After that the person is asked. Pure.
 */
export function lighter(e: CallEffects): { next: CallEffects; said: string } | null {
  if (e.touchUp === "smooth") return { next: { ...e, touchUp: "subtle" }, said: "Your computer is busy, so your touch-up is subtler for now." }
  if (e.touchUp === "subtle") return { next: { ...e, touchUp: "off" }, said: "Your computer is busy, so touch-up is off for now." }
  if (e.background.kind === "blur" && e.background.strength === "strong") {
    return { next: { ...e, background: { kind: "blur", strength: "light" } }, said: "Your computer is busy, so your background blur is lighter for now." }
  }
  if (e.noise === "strong") {
    return { next: { ...e, noise: "standard" }, said: "Your computer is busy, so strong noise reduction is off for now. Your browser's own is on." }
  }
  if (e.lowLight) return { next: { ...e, lowLight: false }, said: "Your computer is busy, so low light is off for now." }
  return null
}
