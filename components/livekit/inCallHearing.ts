import { callLength } from "@/lib/calls/callLength"
import { clockTime } from "@/lib/utils/date/clock"
import type { CallTranscription } from "./callState"

/**
 * What the in-call assistant can hear (CALLS-05). It answers from the call's
 * transcript only: this screen's own lines since it came into the call, or,
 * in a call that keeps its transcript and had it on before this screen came
 * in, the call's kept lines, which the server reads when the screen sends
 * none (UX-CALLS-H3 reads only the call going on).
 */
export interface InCallHearing {
  /** The call's transcript is on. */
  on: boolean
  /** While on: the moment (unix ms) the answers reach back to. */
  from?: number
  /** The server reads the call's kept transcript, from when it came on: this screen came in after. */
  kept?: boolean
  /** While off: turns the transcript on for everyone, through the call's confirm. Absent where the workspace has transcripts off. */
  onTurnOn?: () => void
}

/** A screen that came in this long after the transcript began has missed some of it. */
const LATE_MS = 30_000
/** Suggestions wait until the assistant has heard this long: before that, "what did we decide?" has no answer. */
const READY_MS = 30_000

/** What the assistant hears in a call whose transcript is `t`, on a screen that came into it at `cameIn`. Pure. */
export function hearingOf(t: CallTranscription, cameIn: number, onTurnOn?: () => void): InCallHearing {
  if (!t.on) return onTurnOn ? { on: false, onTurnOn } : { on: false }
  const since = t.since ?? cameIn
  if (t.kept !== false && cameIn - since > LATE_MS) return { on: true, from: since, kept: true }
  return { on: true, from: Math.max(cameIn, since) }
}

/**
 * The panel's line about it, at `now`: whether it listens, its state (what a
 * screen reader is told as it changes), what it has heard (said beside the
 * state, never announced: it changes every minute), and whether it has heard
 * enough for the suggestions. Pure.
 */
export function hearingLine(h: InCallHearing, now: number): { listening: boolean; state: string; detail: string; ready: boolean } {
  if (!h.on) return { listening: false, state: h.onTurnOn ? "Not listening yet" : "Not listening", detail: "", ready: false }
  const heard = now - (h.from ?? now)
  if (h.kept && h.from !== undefined) return { listening: true, state: "Listening", detail: `transcript on since ${clockTime(h.from)}`, ready: heard >= READY_MS }
  if (heard < READY_MS) return { listening: true, state: "Listening", detail: "just started", ready: false }
  return { listening: true, state: "Listening", detail: `${callLength(heard / 1000)} heard`, ready: true }
}
