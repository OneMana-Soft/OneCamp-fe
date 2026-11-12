"use client"

import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/statusWord"
import { CallNotice } from "./CallNotice"

// A recording asks first and tells everyone (CALLS-07), as captions do: the
// person who records reads what it means before it starts, and everyone else
// reads who started it, with the choice to leave. Imported by the call alone
// (VideoConference), so no green room or guest page carries it.

/**
 * The confirm before a recording starts: everyone is told, and where the
 * recording goes, from the call's place ("in #launch", "with Maya Chen"). Pure.
 */
export function recordingConfirm(place?: string): { title: string; description: string; confirmText: string } {
  const goes = place?.startsWith("in #")
    ? `goes to ${place.slice(3)}'s recordings, where its members can watch it`
    : place?.startsWith("with ")
      ? `goes to your conversation ${place}, where only the people in it can watch it`
      : "stays with this conversation, for the people in it"
  return { title: "Record this call?", description: `Everyone in it is told, and can leave. The recording ${goes}.`, confirmText: "Start recording" }
}

/**
 * What this screen has had of a recording, kept through moves: the one it
 * read the notice of or started (mine), by its egress id. The server writes a
 * recording in two steps (initializers/livekitInit/connectLivekit.go): who
 * started it first, its egress id seconds later, once the egress has started;
 * key is "" until the id lands.
 */
export interface RecordingSeen {
  key: string
  mine: boolean
}

/** Whether seen is the recording going on, whose egress id is key ("" before it lands): the same id, or one seen before its id landed. Pure. */
export function sameRecording(seen: RecordingSeen | null, key: string): boolean {
  return !!seen && (seen.key === key || seen.key === "")
}

/**
 * seen once the call's recording is on or off (was: it was on) with egress id
 * key: carried over to the id when the id lands, so what was read or started
 * before it was read or started for it (nobody told twice, its starter never);
 * forgotten when a recording ends before its id landed, so the next one is
 * news. Otherwise seen itself. Pure.
 */
export function seenAfter(seen: RecordingSeen | null, on: boolean, was: boolean, key: string): RecordingSeen | null {
  if (!seen || seen.key !== "") return seen
  if (on && key) return { key, mine: seen.mine }
  return was && !on ? null : seen
}

/**
 * What everyone but its starter reads when a recording starts: who started
 * it, that everything from now is recorded, and Leave call (CallNotice: Esc
 * and Got it). Shown once per recording; the pill keeps saying it after (the
 * call says who started recording to a screen reader).
 */
export function RecordingNotice({ by, onDismiss, onLeave }: { by?: string; onDismiss: () => void; onLeave: () => void }) {
  return (
    <CallNotice
      data={{ "data-recording-notice": "" }}
      mark={<StatusDot tone="danger" className="size-2" />}
      title={by ? `${by} started recording` : "Recording started"}
      body="Everything said and shown from now is recorded. Leave if you don't want to be in it."
      onDismiss={onDismiss}
      actions={
        <Button size="sm" variant="ghost" onClick={onLeave} className="text-danger-ink hover:text-danger-ink">
          Leave call
        </Button>
      }
    />
  )
}
