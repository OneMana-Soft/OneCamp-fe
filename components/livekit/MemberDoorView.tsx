"use client"

// A member at a link, as themselves (calls HU13): a meeting's link, a room's
// address, or a call's invite, opened from the guest page's "Join as
// yourself". The green room says whose call it is, and under the workspace's
// name who joins ("Joining as Kai Lin"); Join comes in by the door. "Join as
// Kai Lin", pressed at the guest link a moment ago in this tab, comes in at
// once with the choices made there (lib/calls/doorJoin). Someone in the
// call's conversation is sent to its own call. A call by its invite has
// nothing of the conversation: no chat, no assistant, no Record. A dead
// link says so at once, from the door's own read, as every dead link is told
// (PublicGone), and the green room waits for that read in the call's shape
// (GuestNotYet), so a link that can't join never asks for the camera.
// An event's room (gcal-15, /app/meet/e/<id>) is one more door, read and
// joined by the calendar's routes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { GREEN_ROOM_GROUND } from "@/components/livekit/CallStage"
import { PublicHeader } from "@/components/guest/publicHeader"
import { GuestNotYet, useGuestAnswer } from "@/components/guest/guestUi"
import { PublicGone } from "@/components/guest/publicStates"
import { LINK_GONE, ROOM_GONE } from "@/components/guest/doorGone"
import { JoiningAs } from "@/components/guest/joiningAs"
import { peekDoorJoin, takeDoorJoin } from "@/lib/calls/doorJoin"
import { Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { LazyVideoConference as VideoConference } from "@/components/livekit/LazyCall"
import { CallRemoved } from "@/components/livekit/CallStage"
import { JoinHandled } from "@/components/livekit/useCallLifecycle"
import { useCallSession } from "@/components/livekit/useCallSession"
import type { CallStateRead } from "@/components/livekit/callState"
import { keptUnlock } from "@/components/guest/roomUnlock"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { displayNameOf } from "@/lib/personName"
import { apiErrorCode, apiErrorStatus } from "@/lib/utils/apiError"
import { GetEndpointUrl } from "@/services/endPoints"
import type { PublicResult } from "@/services/publicApi"
import { doorPath, getGuestMeetingStatus, linkDoor, roomDoor } from "@/services/guestDoor"
import { enterByDoor, getEventRoom, type MemberDoor } from "@/services/callInviteService"
import { callRefOfRoom } from "@/lib/calls/callRef"
import { CompanionMode, MemberCallEnd, MemberPreJoin, memberCompanion, useMemberCallLifecycle } from "@/components/livekit/LazyCompanion"
import { conversationCallPath } from "@/lib/calls/conversationCallPath"
import { app_home_path } from "@/types/paths"
import type { UserProfileInterface } from "@/types/user"

/** What the door's guest page is told: whose call it is, whose workspace, what it has on, and a room's "locked". */
type DoorStatus = { title?: string; state?: string; workspace_name?: string } & Pick<CallStateRead, "recording" | "transcription">

export function MemberDoorView({ door }: { door: MemberDoor }) {
  const router = useRouter()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfUUID = self.data?.data.user_uuid
  // A room's passcode, unlocked at its address in this tab.
  const slug = "slug" in door ? door.slug : ""
  const asked = useMemo<MemberDoor>(() => ("slug" in door ? { slug, unlock: keptUnlock(slug) } : door), [door, slug])
  // The door's own read, as its guest page asks it (useGuestAnswer): asked
  // again while the server is busy or out of reach, and given up on only when
  // the link is gone, which is then said at once, before any green room.
  const reading = useMemo((): { key: string; ask: () => Promise<PublicResult<DoorStatus>> } => {
    if ("event" in asked) return { key: `member-door:event:${asked.event}`, ask: () => getEventRoom(asked.event) }
    const guestDoor = "token" in asked ? linkDoor(asked.token) : roomDoor(asked.slug, asked.unlock)
    return { key: `member-door:${doorPath(guestDoor)}`, ask: () => getGuestMeetingStatus(guestDoor) }
  }, [asked])
  const answer = useGuestAnswer(reading.key, reading.ask)
  const status = answer.data
  const trouble = answer.trouble
  const [ended, setEnded] = useState<"gone" | "locked" | null>(null)
  const [room, setRoom] = useState("")

  const life = useMemberCallLifecycle(
    useCallback(
      async ({ language }) => {
        try {
          const entry = await enterByDoor(asked, language)
          const own = entry.conversation ? conversationCallPath(entry.conversation, selfUUID) : ""
          if (own) {
            router.replace(own)
            throw new JoinHandled()
          }
          setRoom(entry.room)
          return entry.token ?? ""
        } catch (e) {
          if (e instanceof JoinHandled) throw e
          const status = apiErrorStatus(e)
          if (status === 401 && apiErrorCode(e) === "locked") setEnded("locked")
          else if (status === 404 || ("event" in asked && status === 403 && !apiErrorCode(e))) setEnded("gone")
          else throw e
          throw new JoinHandled()
        }
      },
      [asked, router, selfUUID],
    ),
  )
  // "Join as Kai Lin" at this door's guest link a moment ago, in this tab: read
  // on the first render, so no green room shows, then taken once and joined.
  const [going] = useState(() => (typeof window === "undefined" ? null : peekDoorJoin(window.location.pathname)))
  const went = useRef(false)
  const join = life.join
  // After the profile, which the door's join reads to send someone in the
  // conversation to its own call.
  const profileRead = !!selfUUID || !!self.isError
  useEffect(() => {
    if (!going || went.current || !profileRead) return
    went.current = true
    takeDoorJoin(window.location.pathname)
    join(going)
  }, [going, join, profileRead])
  const phase = life.phase === "prejoin" || life.phase === "joining" ? "waiting" : life.phase === "in-call" ? "in-call" : "over"
  const read = useCallSession(room ? callRefOfRoom(room) : null, phase)
  // Another device of yours in this call (meet-04): a companion, present only, or Switch here.
  const companion = memberCompanion(life, read?.session, selfUUID)
  const home = () => router.push("/app")
  // Gone at the door's read or at Join: in the guest page's words, with the
  // member's way home and no credit (they are in their own workspace). An
  // event's is a refusal, as the call's own are said.
  const gone =
    "event" in door ? (
      <CallRemoved kind="unavailable" title="You can't join this event's call" detail="It may have been deleted, or you're not on it. Ask its organiser to invite you." onBack={home} backLabel="Go home" />
    ) : (
      <PublicGone surface="guest-meeting" credit={false} {...("token" in door ? LINK_GONE : ROOM_GONE)} back={{ label: "Go home", href: app_home_path }} />
    )

  if (ended === "gone" || trouble === "gone") return gone
  // A room this tab hasn't unlocked says so before its green room, as on Join.
  if (ended === "locked" || status?.state === "locked") {
    return (
      <CallRemoved
        kind="unavailable"
        title="This room needs its passcode"
        detail="Enter it at the room's address, then join as yourself from there."
        primary={{ label: "Enter the passcode", onClick: () => router.push(`/r/${encodeURIComponent(slug)}`) }}
        onBack={home}
      />
    )
  }
  if (life.phase === "left" || life.phase === "removed" || life.phase === "failed") {
    return <MemberCallEnd call={life} onBack={home} backLabel="Back" companion={companion?.onJoin} />
  }
  if (life.phase === "prejoin" || life.phase === "joining") {
    const joiningAtOnce = !!going && !life.joinError
    // Until the door answers, the call's shape says what it is doing, as the
    // guest door's does, and nothing asks for the camera: the green room comes
    // only for a link that can join.
    if (!status && !joiningAtOnce) return <GuestNotYet trouble={trouble} gone={gone} shape="call" label="Checking the link…" />
    const name = displayNameOf(self.data?.data) || ""
    return (
      <div data-member-door="" className="flex min-h-dvh w-full flex-col">
        <PublicHeader workspaceName={status?.workspace_name} title={name ? <JoiningAs name={name} /> : undefined} />
        <div className="flex w-full flex-1 flex-col [&>[data-prejoin]]:flex-1">
          {joiningAtOnce ? (
            <div role="status" className={cn("flex flex-1 items-center justify-center gap-2 text-ui text-ink-2", GREEN_ROOM_GROUND)}>
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              {status?.title ? `Joining ${status.title}…` : "Joining the call…"}
            </div>
          ) : (
            <MemberPreJoin
              onJoin={life.join}
              companion={companion}
              live={!!read?.live}
              username={name}
              hueId={selfUUID}
              place={status?.title}
              recording={!!status?.recording?.on}
              recordingBy={status?.recording?.on ? status.recording.by || null : null}
              transcription={status?.transcription}
              joining={life.phase === "joining"}
              joinError={life.joinError}
              onCancel={home}
              embedded
            />
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="relative h-full w-full">
      <VideoConference
        token={life.token}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
        onDisconnect={life.onDisconnect}
        onConnected={life.onConnected}
        isAdmin={false}
        place={status?.title}
        inviteOnly={!room.startsWith("meet-")}
        audio={life.choice.audio}
        video={life.choice.video}
        tracks={life.choice.tracks}
        screen={life.screen}
        companionMode={CompanionMode}
        sessionId={read?.session?.id}
        lobby={read?.waiting}
      />
    </div>
  )
}
