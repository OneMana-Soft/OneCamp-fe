"use client"

// A personal room's address for someone outside the workspace (/r/<slug>,
// calls CALLS-2): its passcode first when it has one, then the meeting as any
// guest meets it (GuestMeeting): the green room, the lobby's wait, the call.
// An event's invitee arrives from their invitation's "Join call" with their key
// in the fragment (meet-02): read once, dropped from the address so it isn't
// copied on, and sent with the join so they come in without knocking.

import { useCallback, useEffect, useMemo, useState } from "react"

import { GuestMeeting } from "@/components/guest/GuestMeeting"
import { PublicGone } from "@/components/guest/publicStates"
import { ROOM_GONE } from "@/components/guest/doorGone"
import { LockTile, PublicCard, SecretForm } from "@/components/guest/SecretCard"
import { dropUnlock, keepUnlock, keptUnlock } from "@/components/guest/roomUnlock"
import { roomDoor } from "@/services/guestDoor"
import { publicTrouble, sendFailedText } from "@/services/publicApi"
import { unlockRoom } from "@/services/roomService"
import { roomDoorPath } from "@/lib/calls/roomDoor"
import { invitationIn } from "@/lib/calls/invitationKey"

const gone = <PublicGone surface="guest-meeting" {...ROOM_GONE} />

/** A room's passcode, asked once per tab while its unlock lasts. */
function RoomPasscode({ slug, again, onUnlocked }: { slug: string; again: boolean; onUnlocked: (k: string, seconds: number) => void }) {
  return (
    <PublicCard
      surface="guest-meeting"
      high
      tile={<LockTile />}
      title="This room needs a passcode"
      line={again ? "Its passcode has changed. Whoever invited you has the new one." : "Whoever invited you has it."}
    >
      <SecretForm
        label="Passcode"
        action="Continue"
        autoComplete="off"
        onSubmit={async (passcode) => {
          const res = await unlockRoom(slug, passcode)
          if (res.ok) {
            onUnlocked(res.data.token, res.data.expires_in)
            return undefined
          }
          if (res.status === 401) return "That passcode doesn't open this room."
          return publicTrouble(res.status) === "gone" ? "This room isn't open any more. Ask whoever invited you for its link." : sendFailedText(res)
        }}
      />
    </PublicCard>
  )
}

export function RoomDoorway({ slug }: { slug: string }) {
  const [k, setK] = useState<string | undefined>(() => keptUnlock(slug))
  // Asked for its passcode: first, or again once the one typed stopped working.
  const [asking, setAsking] = useState<"first" | "again" | null>(null)
  const [invitation] = useState<string | undefined>(() => (typeof window === "undefined" ? undefined : invitationIn(window.location.hash)))
  useEffect(() => {
    if (invitation && invitationIn(window.location.hash)) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)
  }, [invitation])
  const door = useMemo(() => roomDoor(slug, k, invitation), [slug, k, invitation])
  const locked = useCallback(() => {
    dropUnlock(slug)
    setAsking((was) => was ?? (k ? "again" : "first"))
    setK(undefined)
  }, [slug, k])

  if (asking) {
    return (
      <RoomPasscode
        slug={slug}
        again={asking === "again"}
        onUnlocked={(token, seconds) => {
          keepUnlock(slug, token, seconds)
          setK(token)
          setAsking(null)
        }}
      />
    )
  }
  return <GuestMeeting key={k ?? ""} door={door} gone={gone} onLocked={locked} memberHref={roomDoorPath(slug)} />
}
