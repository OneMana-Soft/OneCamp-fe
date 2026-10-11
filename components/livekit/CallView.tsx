"use client"

// A call in a channel, a DM or a group: the pre-join screen, then the call.
// The three call pages were near copies of this; they render it now, and so
// does a side pane (split view), which is how a call sits beside the
// conversation, a doc or a board while it runs.

import { displayNameOf } from "@/lib/personName"
import { useCallback, useState } from "react"
import { PreJoin } from "@/components/livekit/PreJoin"
import { VideoConference } from "@/components/livekit/VideoConference"
import { CallLeft } from "@/components/livekit/CallStage"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
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

export function CallView({ kind, id, onLeave, embedded = false }: { kind: CallKind; id: string; onLeave: () => void; embedded?: boolean }) {
  const call = CALLS[kind]
  const post = usePost()
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const { place, isAdmin, live } = usePlace(kind, id, self.data?.data.user_uuid)
  const [joined, setJoined] = useState(false)
  const [token, setToken] = useState("")
  // After leaving: how long it lasted, and the way back in (hub.md C11).
  const [left, setLeft] = useState<{ minutes: number } | null>(null)
  const [joinedAt, setJoinedAt] = useState<number | null>(null)

  const join = useCallback(
    (values: { audioEnabled: boolean; videoEnabled: boolean }) => {
      setJoined(true)
      post
        .makeRequest<Record<string, unknown>, CallTokenResponseInterface>({
          apiEndpoint: call.token,
          payload: { [call.idField]: id, audio_enabled: values.audioEnabled, video_enabled: values.videoEnabled },
        })
        .then((resp) => {
          if (resp) {
            setToken(resp.token)
            setJoinedAt(Date.now())
          } else setJoined(false)
        })
    },
    [post, call, id],
  )

  const toggleRecording = useCallback(
    (isRecording: boolean) => {
      void post.makeRequest({ apiEndpoint: isRecording ? call.stop : call.start, payload: { [call.idField]: id } })
    },
    [post, call, id],
  )

  const leaveCall = useCallback(() => {
    setLeft({ minutes: joinedAt ? Math.max(1, Math.round((Date.now() - joinedAt) / 60000)) : 0 })
    setJoined(false)
    setToken("")
  }, [joinedAt])

  if (left) {
    return (
      <CallLeft
        minutes={left.minutes || undefined}
        onRejoin={() => setLeft(null)}
        onBack={onLeave}
        backLabel={kind === "channel" && place ? `Back to ${place.replace(/^in /, "")}` : "Back"}
      />
    )
  }
  if (!joined) {
    return (
      <PreJoin
        onJoin={join}
        username={displayNameOf(self.data?.data) || ""}
        hueId={self.data?.data.user_uuid}
        place={place}
        live={!!live}
        inCall={kind === "channel" && live === false ? [] : undefined}
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
    />
  )
}
