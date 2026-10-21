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
  participant: Participant
}

/** The people in a call, you first and the rest by name: no agent. Pure. */
export function peopleOf(participants: readonly Participant[]): CallPerson[] {
  return participants
    .filter((p) => senderOf(p) === "participant")
    .map((p) => {
      const { name, guest } = guestName(p.identity, p.name || p.identity)
      return {
        identity: p.identity,
        name,
        guest,
        you: p.isLocal,
        micOn: p.isMicrophoneEnabled,
        cameraOn: p.isCameraEnabled,
        sharing: !!p.isScreenShareEnabled,
        role: partOf(p.attributes).role,
        participant: p,
      }
    })
    .sort((a, b) => (a.you === b.you ? a.name.localeCompare(b.name) : a.you ? -1 : 1))
}

/** The people in the room this is drawn in, kept current as they come, go, mute and change part. */
export function useCallPeople(): CallPerson[] {
  // useParticipants answers anew on every participant event (a mute, a new part too).
  return peopleOf(useParticipants())
}

/** The words beside a name: You, their part, Guest. Pure. */
export function personTags(p: Pick<CallPerson, "you" | "role" | "guest">): string {
  return [p.you ? "You" : null, roleLabel(p.role), p.guest ? "Guest" : null].filter(Boolean).join(" · ")
}

/** The panel's buttons on the stage's dark: 28px for a pointer, 44px for a finger. */
