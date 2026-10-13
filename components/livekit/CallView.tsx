"use client"

// A call in a channel, a DM or a group: the pre-join screen, then the call.
// The three call pages were near copies of this; they render it now, and so
// does a side pane (split view), which is how a call sits beside the
// conversation, a doc or a board while it runs.

import { displayNameOf } from "@/lib/personName"
import { useCallback, useState } from "react"
import { PreJoin } from "@/components/livekit/PreJoin"
import { VideoConference, type CallEnd } from "@/components/livekit/VideoConference"
import { CONNECT_FAILURE_TEXT, type ConnectFailure } from "@/components/livekit/callErrors"
import { CallLeft, CallRemoved } from "@/components/livekit/CallStage"
import { joinLanguage, peopleInCall, removedText, type CallRemoval, type CallStateRead } from "@/components/livekit/callState"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useClientConfig } from "@/hooks/useClientConfig"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { callStatePath } from "@/services/callService"
import type { CallTokenResponseInterface, RawUserDMInterface, UserProfileInterface } from "@/types/user"
import type { ChannelInfoInterfaceResp } from "@/types/channel"

export type CallKind = "channel" | "chat" | "group"

/** Where each kind of call gets its token and records, and how it names the other side. */
const CALLS: Record<CallKind, { token: PostEndpointUrl; start: PostEndpointUrl; stop: PostEndpointUrl; idField: string }> = {
  channel: {
    token: PostEndpointUrl.CreateChannelVideoCallToken,
    start: PostEndpointUrl.StartChannelCallRecording,
    stop: PostEndpointUrl.StopChannelCallRecording,
    idField: "channel_uuid",
  },
  chat: {
    token: PostEndpointUrl.CreateChatVideoCallToken,
    start: PostEndpointUrl.StartDmCallRecording,
    stop: PostEndpointUrl.StopDmCallRecording,
    idField: "user_uuid",
  },
  group: {
    token: PostEndpointUrl.CreateGroupChatVideoCallToken,
    start: PostEndpointUrl.StartGrpCallRecording,
    stop: PostEndpointUrl.StopGrpCallRecording,
    idField: "grp_id",
  },
}

/** "in #engineering", "with Maya Chen", "with Maya, Jonas": where the call is, after "Call". And who may record it. */
function usePlace(kind: CallKind, id: string, selfId?: string): { place?: string; isAdmin: boolean; live?: boolean } {
  const channel = useFetch<ChannelInfoInterfaceResp>(kind === "channel" ? `${GetEndpointUrl.ChannelBasicInfo}/${id}` : "")
  // The same requests the conversation's header makes, so they are usually cached.
  const other = useFetchOnlyOnce<UserProfileInterface>(kind === "chat" ? `${GetEndpointUrl.SelfProfile}/${id}` : "")
  const group = useFetchOnlyOnce<RawUserDMInterface>(kind === "group" ? `${GetEndpointUrl.GetDmGroupParticipants}/${id}` : "")
  if (kind === "channel") {
    const info = channel.data?.channel_info
    return { place: info?.ch_name ? `in #${info.ch_name}` : undefined, isAdmin: !!info?.ch_is_admin, live: info ? !!info.ch_call_active : undefined }
  }
  if (kind === "chat") {
    const name = displayNameOf(other.data?.data)
    return { place: name ? `with ${name}` : undefined, isAdmin: true }
  }
  const names = (group.data?.data?.dm_participants || []).filter((u) => u.user_uuid !== selfId).map((u) => displayNameOf(u))
  return { place: names.length ? `with ${names.join(", ")}` : undefined, isAdmin: true }
}

/**
 * The call as it is before joining (CALL-BUG-12): whether it is recorded or
 * captioned, and by whom, so the green room can say so before Join; who is in
 * it; and whether this person may remove others. Kept fresh while the green
 * room is open, since a recording can start while someone decides.
 */
function useCallState(kind: CallKind, id: string, waiting: boolean): CallStateRead | undefined {
  const { data } = useFetch<{ data?: CallStateRead }>(callStatePath(kind, id), undefined, { refreshInterval: waiting ? 10_000 : 0 }, OWN_ERRORS)
  return data?.data
}

export function CallView({ kind, id, onLeave, embedded = false }: { kind: CallKind; id: string; onLeave: () => void; embedded?: boolean }) {
  const call = CALLS[kind]
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const { place, isAdmin, live } = usePlace(kind, id, self.data?.data.user_uuid)
  const [joined, setJoined] = useState(false)
  const [token, setToken] = useState("")
  // The green room's choice, carried into the call (CALL-BUG-1).
  const [choice, setChoice] = useState({ audio: true, video: true })
  const [joinError, setJoinError] = useState<string | undefined>()
  const state = useCallState(kind, id, !joined)
  // After leaving: how long it lasted, and the way back in (hub.md C11).
  const [left, setLeft] = useState<{ minutes: number } | null>(null)
  // Removed by a host (CALL-BUG-11): why, and no way back into this call.
  const [removed, setRemoved] = useState<CallRemoval | null>(null)
  // Never connected (CALL-BUG-23): which kind of failure, and Try again.
  const [failed, setFailed] = useState<ConnectFailure | null>(null)
  // When the call connected: a call that never did has no duration.
  const [joinedAt, setJoinedAt] = useState<number | null>(null)
  const transcriptionConfig = useTranscriptionConfig()

  const join = useCallback(
    (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
      setJoined(true)
      setJoinError(undefined)
      setChoice({ audio: values.audioEnabled, video: values.videoEnabled })
      const language = joinLanguage()
      axiosInstance
        .post<{ data?: CallTokenResponseInterface }>(
          call.token,
          { [call.idField]: id, audio_enabled: values.audioEnabled, video_enabled: values.videoEnabled, ...(language ? { language } : {}) },
          OWN_ERRORS,
        )
        .then((resp) => {
          const t = resp.data?.data?.token
          if (!t) throw new Error("The call didn't answer with a way in.")
          setToken(t)
          setJoinedAt(null)
        })
        .catch((e: unknown) => {
          // Said under Join: a removal ("You were removed from this call.")
          // or anything else that kept them out.
          setJoined(false)
          setJoinError(apiErrorMessage(e, "Try again in a moment."))
        })
    },
    [call, id],
  )

  // The request itself, so a refusal can be said in the call (CALL-BUG-9's
  // silent spinner): the dock reads the rejection.
  const toggleRecording = useCallback(
    (isRecording: boolean) => axiosInstance.post(isRecording ? call.stop : call.start, { [call.idField]: id }, OWN_ERRORS),
    [call, id],
  )

  const leaveCall = useCallback(
    (end?: CallEnd) => {
      setJoined(false)
      setToken("")
      if (end?.removed) {
        setRemoved(end.removed)
        return
      }
      if (end?.failed) {
        setFailed(end.failed)
        return
      }
      // Left before the call connected: back to the green room, no "You left".
      if (!joinedAt) return
      setLeft({ minutes: Math.max(1, Math.round((Date.now() - joinedAt) / 60000)) })
    },
    [joinedAt],
  )

  const backLabel = kind === "channel" && place ? `Back to ${place.replace(/^in /, "")}` : "Back"
  if (failed) {
    return (
      <CallRemoved
        kind="failed"
        title="Couldn't connect to the call"
        detail={CONNECT_FAILURE_TEXT[failed]}
        primary={{
          label: "Try again",
          onClick: () => {
            setFailed(null)
            join({ audioEnabled: choice.audio, videoEnabled: choice.video })
          },
        }}
        onBack={onLeave}
        backLabel={backLabel}
        embedded={embedded}
      />
    )
  }
  if (removed) {
    const { title, detail } = removedText(removed)
    return <CallRemoved title={title} detail={detail} onBack={onLeave} backLabel={backLabel} embedded={embedded} />
  }
  if (left) {
    return (
      <CallLeft
        minutes={left.minutes}
        onRejoin={() => setLeft(null)}
        onBack={onLeave}
        backLabel={backLabel}
        embedded={embedded}
      />
    )
  }
  if (!joined) {
    const active = state?.active ?? live
    return (
      <PreJoin
        onJoin={join}
        username={displayNameOf(self.data?.data) || ""}
        hueId={self.data?.data.user_uuid}
        place={place}
        live={!!active}
        inCall={peopleInCall(state?.participants) ?? (kind === "channel" && active === false ? [] : undefined)}
        recording={!!state?.recording?.on}
        recordingBy={state?.recording?.on ? state.recording.by || null : null}
        transcription={state?.transcription}
        joinError={joinError}
        openUrl={typeof window === "undefined" ? undefined : new URL(`/app/meet/${kind === "channel" ? "ch" : kind === "chat" ? "chat" : "grp"}/${id}`, window.location.origin).href}
        onCancel={onLeave}
        embedded={embedded}
      />
    )
  }
  return (
    <VideoConference
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
      onDisconnect={leaveCall}
      toggleRecording={toggleRecording}
      isAdmin={isAdmin}
      place={place}
      embedded={embedded}
      audio={choice.audio}
      video={choice.video}
      canRemove={!!state?.can_remove}
      onConnected={() => setJoinedAt(Date.now())}
      transcriptionConfig={transcriptionConfig}
    />
  )
}

/** The workspace's transcription settings, for a member's call (VideoConference's transcriptionConfig). */
export function useTranscriptionConfig() {
  const c = useClientConfig() as ReturnType<typeof useClientConfig> & { transcription_where?: string; transcription_language?: string }
  return { mode: c.transcription_mode, where: c.transcription_where, language: c.transcription_language }
}
