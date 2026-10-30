"use client"

/**
 * Who is in the call (step 3, part 2): the dock's Participants count, and
 * the people the list beside the stage shows (CallPeoplePanel, which loads
 * when it is first opened). The tiles count screens (a presenter is two);
 * this counts people, and never the transcription agent.
 */

import { useParticipants } from "@livekit/components-react"
import type { Participant } from "livekit-client"
import { senderOf } from "@/lib/calls/signals"
import { partOf, roleLabel, type CallRole } from "@/lib/calls/control"
import type { CallHold } from "@/lib/calls/holds"
import { feedbackOf, handOf, type CallFeedback } from "@/lib/calls/handsCore"
import { guestName } from "./callLevels"

export interface CallPerson {
  identity: string
  name: string
  guest: boolean
  you: boolean
  micOn: boolean
  cameraOn: boolean
  sharing: boolean
  /** Their part in the call, as the server told the room. */
  role: CallRole
  /** What they may do although the call holds it, as someone running it let them. */
  allowed: ReadonlySet<CallHold>
  /** When their hand went up (the server's time), or null while it is down. */
  hand: number | null
  /** What stays beside their name, or null. */
  feedback: CallFeedback | null
  participant: Participant
}

/**
 * The people in a call: raised hands first, in the order they went up (the
 * queue every screen shares), then you, then the rest by name; no agent. Pure.
 */
export function peopleOf(participants: readonly Participant[]): CallPerson[] {
  return participants
    .filter((p) => senderOf(p) === "participant")
    .map((p) => {
      const { name, guest } = guestName(p.identity, p.name || p.identity)
      const part = partOf(p.attributes)
      return {
        identity: p.identity,
        name,
        guest,
        you: p.isLocal,
        micOn: p.isMicrophoneEnabled,
        cameraOn: p.isCameraEnabled,
        sharing: !!p.isScreenShareEnabled,
        role: part.role,
        allowed: part.allowed ?? new Set(),
        hand: handOf(p.attributes),
        feedback: feedbackOf(p.attributes),
        participant: p,
      }
    })
    .sort((a, b) => {
      if (a.hand !== null || b.hand !== null) {
        if (a.hand === null) return 1
        if (b.hand === null) return -1
        return a.hand - b.hand || a.identity.localeCompare(b.identity)
      }
      return a.you === b.you ? a.name.localeCompare(b.name) : a.you ? -1 : 1
    })
}

/** The people in the room this is drawn in, kept current as they come, go, mute and change part. */
export function useCallPeople(): CallPerson[] {
  // useParticipants answers anew on every participant event (a mute, a new part too).
  return peopleOf(useParticipants())
}

/** What someone let through a hold may do, beside their name while it holds. */
const LET_THROUGH_TAGS: readonly [CallHold, string][] = [
  ["microphone", "Can talk"],
  ["share", "Can share"],
]

/** The words beside a name: You, their part, Guest, and what they were let do while the call holds it. Pure. */
export function personTags(p: Pick<CallPerson, "you" | "role" | "guest"> & { allowed?: ReadonlySet<CallHold> }, held: ReadonlySet<CallHold> = new Set()): string {
  const through = LET_THROUGH_TAGS.filter(([h]) => held.has(h) && p.allowed?.has(h)).map(([, tag]) => tag)
  return [p.you ? "You" : null, roleLabel(p.role), p.guest ? "Guest" : null, ...through].filter(Boolean).join(" · ")
}

/** The panel's buttons on the stage's dark: 28px for a pointer, 44px for a finger. */
