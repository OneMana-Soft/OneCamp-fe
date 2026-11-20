/**
 * A moment in a call, as a recording page's address carries it (zoom-13): the
 * recording to play (?play=, its egress id, or the call's key when nobody
 * recorded it), where in it (?at=, ms from its start) and, for a call with no
 * recording, media=0, so the player reads its words without asking for a
 * picture. Ids and a time only, never words: opening it asks the server again
 * who may. Pure.
 */

import { formatClock } from "@/lib/format/clock"

export interface CallMoment {
  recording: string
  atMs: number
  media: boolean
}

const KEYS = ["play", "at", "media"] as const

/** The query a recording page opens a moment by. */
export function momentQuery(m: CallMoment): string {
  const q = new URLSearchParams({ play: m.recording, at: String(Math.max(0, Math.floor(m.atMs) || 0)) })
  if (!m.media) q.set("media", "0")
  return q.toString()
}

/** The moment an address asks for, or null for none. An at that isn't a time opens at the start. */
export function readMoment(params: { get(key: string): string | null } | null | undefined): CallMoment | null {
  const recording = params?.get("play")?.trim()
  if (!recording) return null
  const at = Number(params?.get("at"))
  return { recording, atMs: Number.isFinite(at) && at > 0 ? Math.floor(at) : 0, media: params?.get("media") !== "0" }
}

/** The address without its moment, the rest of its query kept: closing the player doesn't open it again. */
export function withoutMoment(pathname: string, params: { toString(): string }): string {
  const q = new URLSearchParams(params.toString())
  for (const k of KEYS) q.delete(k)
  const rest = q.toString()
  return rest ? `${pathname}?${rest}` : pathname
}

/** The moment as the row says it, "at 2:05": whole seconds, never rounded up to one not yet said. */
export function momentLabel(ms: number): string {
  return formatClock(Math.floor(Math.max(0, ms || 0) / 1000) * 1000)
}
