"use client"

// A call in a channel, a DM or a group: the pre-join screen, then the call.
// The three call pages were near copies of this; they render it now, and so
// does a side pane (split view), which is how a call sits beside the
// conversation, a doc or a board while it runs.

import { displayNameOf } from "@/lib/personName"
import { useCallback } from "react"
import { PreJoin } from "@/components/livekit/PreJoin"
import { VideoConference } from "@/components/livekit/VideoConference"
import { CallEndScreen } from "@/components/livekit/CallEndScreen"
import { useCallLifecycle } from "@/components/livekit/useCallLifecycle"
import { peopleInCall, peopleOfSession } from "@/components/livekit/callState"
import { useCallSession } from "@/components/livekit/useCallSession"
import { useCallChat } from "@/components/livekit/callChat"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useClientConfig } from "@/hooks/useClientConfig"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { callRefOf } from "@/services/callService"
import type { CallTokenResponseInterface, RawUserDMInterface, UserProfileInterface } from "@/types/user"
import type { ChannelInfoInterfaceResp } from "@/types/channel"

export type CallKind = "channel" | "chat" | "group"

/** Where each kind of call gets its token and records, and how it names the other side. */
const CALLS: Record<CallKind, { token: string; start: string; stop: string; idField: string }> = {
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

export function CallView({ kind, id, onLeave, embedded = false }: { kind: CallKind; id: string; onLeave: () => void; embedded?: boolean }) {
  const call = CALLS[kind]
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const { place, isAdmin, live } = usePlace(kind, id, self.data?.data.user_uuid)
  const transcriptionConfig = useTranscriptionConfig()
  const life = useCallLifecycle(
    useCallback(
      async ({ audio, video, language }) => {
        const resp = await axiosInstance.post<{ data?: CallTokenResponseInterface }>(
          call.token,
          { [call.idField]: id, audio_enabled: audio, video_enabled: video, ...(language ? { language } : {}) },
          OWN_ERRORS,
        )
        return resp.data?.data?.token ?? ""
      },
      [call, id],
    ),
  )
  const phase = life.phase === "prejoin" || life.phase === "joining" ? "waiting" : life.phase === "in-call" ? "in-call" : "over"
  const read = useCallSession(callRefOf(kind, id, self.data?.data.user_uuid), phase)
  const sessionId = read?.session?.id
  // The conversation the call belongs to, beside it: the dock's Chat.
  const chat = useCallChat(kind, id)

  // The request itself, so a refusal can be said in the call (CALL-BUG-9's
  // silent spinner): the dock reads the rejection.
  const toggleRecording = useCallback(
    (isRecording: boolean) => axiosInstance.post(isRecording ? call.stop : call.start, { [call.idField]: id }, OWN_ERRORS),
    [call, id],
  )

  const backLabel = kind === "channel" && place ? `Back to ${place.replace(/^in /, "")}` : "Back"
  if (life.phase === "left" || life.phase === "removed" || life.phase === "failed") {
    return <CallEndScreen call={life} onBack={onLeave} backLabel={backLabel} embedded={embedded} />
  }
  if (life.phase === "prejoin" || life.phase === "joining") {
    const active = read ? read.live : live
    return (
      <PreJoin
        onJoin={life.join}
        username={displayNameOf(self.data?.data) || ""}
        hueId={self.data?.data.user_uuid}
        place={place}
        live={!!active}
        inCall={peopleInCall(peopleOfSession(read)) ?? (kind === "channel" && active === false ? [] : undefined)}
        recording={!!read?.recording?.on}
        recordingBy={read?.recording?.on ? read.recording.by || null : null}
        transcription={read?.transcription}
        refusal={read?.you?.refusal?.msg}
        joining={life.phase === "joining"}
        joinError={life.joinError}
        openUrl={typeof window === "undefined" ? undefined : new URL(`/app/meet/${kind === "channel" ? "ch" : kind === "chat" ? "chat" : "grp"}/${id}`, window.location.origin).href}
        onCancel={onLeave}
        embedded={embedded}
      />
    )
  }
  return (
    <VideoConference
      onChatToggle={chat.onChatToggle}
      isChatOpen={chat.isChatOpen}
      token={life.token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL || ""}
      onDisconnect={life.onDisconnect}
      onConnected={life.onConnected}
      toggleRecording={toggleRecording}
      isAdmin={isAdmin}
      place={place}
      embedded={embedded}
      audio={life.choice.audio}
      video={life.choice.video}
      sessionId={sessionId}
      transcriptionConfig={transcriptionConfig}
    />
  )
}

/** The workspace's transcription settings, for a member's call (VideoConference's transcriptionConfig). */
export function useTranscriptionConfig() {
  const c = useClientConfig() as ReturnType<typeof useClientConfig> & { transcription_where?: string; transcription_language?: string }
  return { mode: c.transcription_mode, where: c.transcription_where, language: c.transcription_language }
}
