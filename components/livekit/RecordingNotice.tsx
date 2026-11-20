"use client"

import { StatusDot } from "@/components/ui/statusWord"
import type { ComponentType } from "react"
import type { AskedNoticeProps } from "./AskedNotice"
import { CallNotice } from "./CallNotice"

// A recording asks first and tells everyone (CALLS-07), as captions do: the
// person who records reads what it means before it starts, and everyone else
// reads who started it, with the choice to leave. Imported by the call alone
// (VideoConference), so no green room or guest page carries it.

/**
 * What a recording is said to be, in one place for the confirm before it
 * starts, everyone else's notice and the screen reader: everyone is told, and
 * where the recording goes, from the call's place ("in #launch", "with Maya
 * Chen"), in the same words in the confirm and the notice (D-CL-7: a guest,
 * who has no place, is told it stays with this conversation); who started it;
 * while the call's transcript is on and kept, that a transcript comes with it
 * (V-948: the server files the call's lines under the recording as it runs,
 * and a recording makes none of its own); and, with that transcript only, when
 * the room's switch says the AI sums the call up (V-951), that a summary may
 * follow in the call's own conversation, where the recap is posted. The recap
 * skips a call too short to sum up, so none promises one.
 * Otherwise every word is as it was. Pure.
 */
export function recordingWords({ place, by, transcript, summary }: { place?: string; by?: string; transcript?: boolean; summary?: boolean }): {
  confirm: { title: string; description: string; confirmText: string }
  title: string
  body: string
  said: string
} {
  const withIt = transcript ? ", with a transcript" : ""
  const sums = !!transcript && !!summary
  const title = by ? `${by} started recording` : "Recording started"
  const channel = place?.startsWith("in #") ? place.slice(3) : undefined
  const people = place?.startsWith("with ") ? `your conversation ${place}` : undefined
  const goes = channel
    ? `goes to ${channel}'s recordings, where its members can watch it`
    : people
      ? `goes to ${people}, where only the people in it can watch it`
      : "stays with this conversation, for the people in it"
  return {
    confirm: {
      title: "Record this call?",
      description: `Everyone in it is told, and can leave. The recording${withIt}${withIt && ","} ${goes}.${sums ? ` After the call, an AI summary is posted ${channel ? `in ${channel}` : "there"} if there's enough to sum up.` : ""}`,
      confirmText: "Start recording",
    },
    title,
    body: `Everything said and shown from now is recorded${withIt}. The recording ${goes}.${sums ? ` An AI summary may follow in ${channel ?? people ?? "this conversation"}.` : ""} Leave if you don't want to be in it.`,
    said: `${title}${withIt}${sums ? ". An AI summary may follow" : ""}`,
  }
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
 * it, that everything from now is recorded (with a transcript, while the call
 * keeps one, and that an AI summary may follow in the call's place, when the
 * server says so), where the recording goes (place, as its confirm says), and Leave call (CallNotice: Esc and Got it; a guest's asks first). Shown once per recording; the pill keeps saying it after (the
 * call says who started recording to a screen reader).
 */
export function RecordingNotice({ place, by, transcript, summary, onDismiss, onLeave, asks, failed, busy }: { place?: string; by?: string; transcript?: boolean; summary?: boolean; onDismiss: () => void; onLeave: () => void; asks?: ComponentType<AskedNoticeProps>; failed?: boolean; busy?: boolean }) {
  const words = recordingWords({ place, by, transcript, summary })
  return (
    <CallNotice
      data={{ "data-recording-notice": "" }}
      mark={<StatusDot tone="danger" className="size-2" />}
      title={words.title}
      body={words.body}
      onDismiss={onDismiss}
      onLeave={onLeave}
      asks={asks}
      failed={failed}
      busy={busy}
    />
  )
}
