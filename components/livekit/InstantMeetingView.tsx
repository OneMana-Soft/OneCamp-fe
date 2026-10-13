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
import { VideoConference } from "@/components/livekit/VideoConference"
import { CallRemoved } from "@/components/livekit/CallStage"
import { CallEndScreen } from "@/components/livekit/CallEndScreen"
import { useCallLifecycle } from "@/components/livekit/useCallLifecycle"
import { useTranscriptionConfig } from "@/components/livekit/CallView"
import { peopleInCall, type CallStateRead } from "@/components/livekit/callState"
import { dropMeetingHandoff, peekMeetingHandoff, rememberGuestLink, rememberedGuestLink } from "@/components/livekit/instantMeeting"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, Copy, Link as LinkIcon, Loader2 } from "@/lib/icons"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useConfirm } from "@/hooks/useConfirm"
import { toast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { guestMeetingLink } from "@/services/guestService"
import { instantMeetingPath, joinInstantMeeting, newInstantMeetingLink } from "@/services/callService"
import type { UserProfileInterface } from "@/types/user"


/** Why the page can't open this meeting, from the server's answer: not the creator's, or over. Pure. */
export function meetingUnavailable(status: number, code: string): { title: string; detail: string } | null {
  if (status === 403 || code === "not_host") {
    return { title: "This meeting is someone else's", detail: "Only the person who started it can open it here. If you were invited, use the link they sent." }
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
  const unavailable = !state && isError ? meetingUnavailable(apiErrorStatus(isError), apiErrorCode(isError)) : null

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
        toast({ title: revokePrevious ? "The old link is off. Here's a new one" : "Here's a new link" })
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
          place={PLACE}
          audio={life.choice.audio}
          video={life.choice.video}
          canRemove={state?.can_remove ?? true}
          extraStatus={<InviteControl link={link} onNewLink={newLink} confirm={confirm} />}
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
      place={PLACE}
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

/** Where the call is, after "Call": a meeting has no name yet (D-CL-20). */
const PLACE = "in an instant meeting"

/**
 * Invite (CALL-BUG-17): the guest link again, a new one, or the old one turned
 * off, which also takes out everyone still on it. On a phone it is the link
 * glyph alone, beside the call's other pills.
 */
function InviteControl({
  link,
  onNewLink,
  confirm,
}: {
  link: string
  onNewLink: (revokePrevious: boolean) => Promise<void>
  confirm: ReturnType<typeof useConfirm>
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "Couldn't copy the link", description: "Select it and copy it yourself.", variant: "destructive" })
    }
  }
  const fresh = async () => {
    setBusy(true)
    try {
      await onNewLink(false)
    } catch (e) {
      toast({ title: "Couldn't make a new link", description: (e as Error).message, variant: "destructive" })
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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Invite a guest"
          className="pointer-events-auto flex h-7 items-center gap-2 rounded-[14px] bg-[#1F2024] px-2.5 text-meta font-medium text-[#EEEEF0] ring-1 ring-white/[0.09] transition-colors hover:bg-[#2A2B30] focus-visible:outline-2 focus-visible:outline-brand"
          data-invite=""
        >
          <LinkIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden @3xl:inline">Invite</span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" className="w-80 max-w-[calc(100vw-24px)] text-ui-sm" data-invite-details="">
        <p className="font-medium text-foreground">Invite a guest</p>
        <p className="mt-0.5 text-meta text-ink-3">Anyone with the link can join as a guest while the meeting lasts.</p>
        {link ? (
          <div className="mt-2.5 flex items-center gap-1.5">
            <input
              readOnly
              aria-label="Guest link"
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="h-8 min-w-0 flex-1 truncate rounded-[8px] bg-sunken px-2 text-meta text-ink-2 ring-1 ring-inset ring-line"
            />
            <Button size="sm" variant="secondary" onClick={() => void copy()}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <p className="mt-2.5 text-ink-2">The link was shown in the tab that started the meeting. Make a new one to share it from here.</p>
        )}
        <div className={cn("mt-3 flex flex-wrap justify-end gap-2")}>
          <Button size="sm" variant={link ? "ghost" : "default"} onClick={() => void fresh()} disabled={busy}>
            {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
            Get a new link
          </Button>
          <Button size="sm" variant="ghost" className="text-danger-ink" onClick={turnOffOld}>
            Turn off the old link
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
