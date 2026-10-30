"use client"

// An instant meeting's own page, /app/meet/m/<id> (CALL-BUG-17). Its creator
// can always come back: after leaving, reloading or losing the tab, the page
// asks the server for a new host token rather than relying on one kept in a
// page that is gone. The guest link is shown again in this tab, and can be
// replaced, with the old one turned off, from the Invite pill.

import { displayNameOf } from "@/lib/personName"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PreJoin } from "@/components/livekit/PreJoin"
import { LazyVideoConference as VideoConference } from "@/components/livekit/LazyCall"
import { CallRemoved } from "@/components/livekit/CallStage"
import { CallEndScreen } from "@/components/livekit/CallEndScreen"
import { useCallLifecycle } from "@/components/livekit/useCallLifecycle"
import { useTranscriptionConfig } from "@/components/livekit/CallView"
import { peopleInCall, type CallStateRead } from "@/components/livekit/callState"
import { dropMeetingHandoff, peekMeetingHandoff, rememberGuestLink, rememberedGuestLink } from "@/components/livekit/instantMeeting"
import { Button } from "@/components/ui/button"
import { InviteLinkRow, InvitePanel } from "./invite"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useConfirm } from "@/hooks/useConfirm"
import { callToast } from "./callSurface"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { GetEndpointUrl } from "@/services/endPoints"
import { guestMeetingLink } from "@/services/guestService"
import { instantMeetingPath, joinInstantMeeting, newInstantMeetingLink } from "@/services/callService"
import { roomLink } from "@/services/guestDoor"
import Link from "next/link"
import { useCallSession } from "@/components/livekit/useCallSession"
import type { UserProfileInterface } from "@/types/user"


/**
 * Why the page can't open this meeting, from the server's answer: not the
 * creator's, never there ("no_meeting"), or over. A 404 without a code, from
 * a server that didn't yet tell the last two apart, reads as over. Pure.
 */
export function meetingUnavailable(status: number, code: string): { title: string; detail: string } | null {
  if (status === 403 || code === "not_host") {
    return { title: "This meeting is someone else's", detail: "Only the person who started it can open it here. If you were invited, use the link they sent." }
  }
  if (code === "no_meeting") {
    return { title: "We couldn't find this meeting", detail: "The link may be mistyped. Check it, or start a new meeting." }
  }
  if (status === 404) {
    return { title: "This meeting has ended", detail: "Its link has expired or was turned off. Start a new meeting to talk again." }
  }
  return null
}

export function InstantMeetingView({ meetingId }: { meetingId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  // The token the start page just minted, if this tab started the meeting.
  const [handoff] = useState(() => peekMeetingHandoff(meetingId))
  useEffect(() => {
    dropMeetingHandoff(meetingId)
  }, [meetingId])
  const transcriptionConfig = useTranscriptionConfig()
  const [link, setLink] = useState(() => rememberedGuestLink(meetingId))
  const life = useCallLifecycle(
    useCallback(
      async ({ language }) => {
        try {
          return (await joinInstantMeeting(meetingId, language)).host_token
        } catch (e) {
          const gone = meetingUnavailable(apiErrorStatus(e), apiErrorCode(e))
          throw gone ? new Error(gone.detail) : e
        }
      },
      [meetingId],
    ),
    handoff ? { token: handoff.hostToken, choice: { audio: handoff.audio, video: handoff.video } } : undefined,
  )

  // The meeting as it is (creator only): whether it is recorded or captioned,
  // who is in it, and whether it is still there. Fresh while deciding to join.
  const waiting = life.phase === "prejoin" || life.phase === "joining"
  const { data, isError } = useFetch<{ data?: CallStateRead }>(instantMeetingPath(meetingId), undefined, { refreshInterval: waiting ? 10_000 : 0 }, OWN_ERRORS)
  const state = data?.data
  // A personal room's meeting page: its address, which has no end.
  const roomAddress = state?.address ? roomLink(state.address) : ""
  const place = roomAddress ? ROOM_PLACE : PLACE
  const unavailable = !state && isError ? meetingUnavailable(apiErrorStatus(isError), apiErrorCode(isError)) : null
  // The meeting's id in Call State, for what its host does to it in the call.
  const call = useCallSession({ kind: "meeting", id: meetingId }, waiting ? "waiting" : life.phase === "in-call" ? "in-call" : "over")

  const back = useCallback(() => {
    if (window.history.length > 1) router.back()
    else router.push("/app/home")
  }, [router])

  const newLink = useCallback(
    async (revokePrevious: boolean) => {
      try {
        const res = await newInstantMeetingLink(meetingId, revokePrevious)
        const next = guestMeetingLink(res.guest_token)
        setLink(next)
        rememberGuestLink(meetingId, next)
        callToast({ title: revokePrevious ? "The old link is off. Here's a new one" : "Here's a new link" })
      } catch (e) {
        throw new Error(apiErrorMessage(e, "Couldn't make a new link. Try again."))
      }
    },
    [meetingId],
  )

  if (life.phase === "removed" || life.phase === "failed") {
    return <CallEndScreen call={life} noun="meeting" onBack={back} />
  }
  if (unavailable && life.phase !== "in-call") {
    return <CallRemoved kind="unavailable" title={unavailable.title} detail={unavailable.detail} primary={{ label: "Start a new meeting", onClick: () => router.push("/app/meet/instant") }} onBack={back} />
  }
  if (life.phase === "left") return <CallEndScreen call={life} noun="meeting" onBack={back} />
  if (life.phase === "in-call" && life.token) {
    return (
      <div className="relative h-full w-full">
        <VideoConference
          token={life.token}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
          onDisconnect={life.onDisconnect}
          onConnected={life.onConnected}
          // Recording an instant meeting has no home yet (PROGRAM.md A2), so
          // there is no Record, rather than one that spins and does nothing.
          isAdmin
          place={place}
          audio={life.choice.audio}
          video={life.choice.video}
          tracks={life.choice.tracks}
          sessionId={call?.session?.id}
          lobby={call?.waiting}
          extraStatus={<InviteControl link={roomAddress || link} room={!!roomAddress} onNewLink={newLink} confirm={confirm} />}
          transcriptionConfig={transcriptionConfig}
        />
      </div>
    )
  }
  return (
    <PreJoin
      onJoin={life.join}
      username={displayNameOf(self.data?.data) || ""}
      hueId={self.data?.data.user_uuid}
      joinLabel="Join meeting"
      place={place}
      joining={life.phase === "joining"}
      joinError={life.joinError}
      live={!!state?.active}
      inCall={peopleInCall(state?.participants)}
      recording={!!state?.recording?.on}
      recordingBy={state?.recording?.on ? state.recording.by || null : null}
      transcription={state?.transcription}
      onCancel={back}
    />
  )
}

/** Where the call is, after "Call": a meeting has no name yet (D-CL-20); a personal room is its owner's. */
const PLACE = "in an instant meeting"
const ROOM_PLACE = "in your room"

/**
 * Invite (CALL-BUG-17): the guest link again, a new one, or the old one turned
 * off, which also takes out everyone still on it. A personal room's is its
 * address, which has no end and is changed in the room's settings, never
 * here. On a phone it is the link glyph alone, beside the call's other pills.
 */
function InviteControl({
  link,
  room,
  onNewLink,
  confirm,
}: {
  link: string
  room?: boolean
  onNewLink: (revokePrevious: boolean) => Promise<void>
  confirm: ReturnType<typeof useConfirm>
}) {
  const [busy, setBusy] = useState(false)
  const fresh = async () => {
    setBusy(true)
    try {
      await onNewLink(false)
    } catch (e) {
      callToast({ title: "Couldn't make a new link", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }
  const turnOffOld = () =>
    confirm({
      title: "Turn off the old link?",
      description: "It stops working, and anyone still in the meeting from it is removed. You get a new link to share.",
      confirmText: "Turn off the old link",
      destructive: true,
      onConfirm: () => onNewLink(true),
    })
  return (
    <InvitePanel
      label="Invite a guest"
      title="Invite a guest"
      description={room ? "Anyone with your room's address can ask to come in." : "Anyone with the link can join as a guest while the meeting lasts."}
      body={
        link ? (
          <InviteLinkRow link={link} label={room ? "Your room's address" : "Guest link"} />
        ) : (
          <p className="mt-2.5 text-ink-2">The link was shown in the tab that started the meeting. Make a new one to share it from here.</p>
        )
      }
      actions={
        room ? (
          <Button size="sm" variant="ghost" asChild>
            <Link href="/app/meet/room" target="_blank" rel="noopener noreferrer">
              Room settings
            </Link>
          </Button>
        ) : (
          <>
            <Button size="sm" variant={link ? "ghost" : "default"} onClick={() => void fresh()} busy={busy}>
              Get a new link
            </Button>
            <Button size="sm" variant="ghost" className="text-danger-ink" onClick={turnOffOld}>
              Turn off the old link
            </Button>
          </>
        )
      }
    />
  )
}
