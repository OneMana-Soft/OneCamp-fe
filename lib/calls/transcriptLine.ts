/** Where a transcript's lines sit in their call: the player's jump, and a search hit's moment (zoom-13). Pure. */

import type { TranscriptInfoInterface } from "@/types/recording"

/**
 * Where a line starts in its recording, in seconds, never below 0.
 *
 * Preferred (skew-free): the producer (the browser in frontend mode, the agent
 * in backend mode) recorded transcript_offset_ms, the line's start from the
 * recording's start IN ITS OWN CLOCK, so two unsynchronised clocks (the
 * speaker's and the egress server's) are never subtracted: that is what made
 * earlier recordings seek several seconds off. Older rows have no offset, so
 * theirs is rebuilt from (the line's own time − the recording's start).
 */
export function lineStartSeconds(item: Pick<TranscriptInfoInterface, "transcript_offset_ms" | "transcript_timestamp">, recordingStartMs: number): number {
  let seconds: number
  if (typeof item.transcript_offset_ms === "number" && item.transcript_offset_ms >= 0) {
    seconds = item.transcript_offset_ms / 1000
  } else {
    // A 10-digit time is in seconds.
    const ms = item.transcript_timestamp < 10_000_000_000 ? item.transcript_timestamp * 1000 : item.transcript_timestamp
    seconds = (ms - recordingStartMs) / 1000
  }
  // Clock jitter or a pre-roll over-shift puts a line before the start.
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0
}

/** The line at or before a moment (seconds): the last that starts by then, else the first; -1 with no lines. */
export function lineAt(starts: readonly number[], seconds: number): number {
  if (starts.length === 0) return -1
  let at = 0
  starts.forEach((s, i) => {
    if (s <= seconds) at = i
  })
  return at
}
