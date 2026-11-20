/** The one player's routes for a conversation's call (the recordings list's and a board's calls'), which ask again who may. Pure. */

import { CallsRecordingGet } from "@/services/endpoints/calls.recordings"
import type { ConversationCallRef } from "@/lib/calls/boardCall"
import type { RecordingInfoInterface } from "@/types/recording"

export interface PlayerUrls {
  media: string
  transcript: string
}

const urlsOf = (media: string, transcript: string, id: string): PlayerUrls => ({ media: `${media}/${id}`, transcript: `${transcript}/${id}` })

/** Before the call's key; a DM's by the other person (yourself, in notes to self). */
export function playerUrls(ref: ConversationCallRef, selfUUID?: string): PlayerUrls {
  if (ref.kind === "channel") return urlsOf(CallsRecordingGet.GetChannelRecordingMedia, CallsRecordingGet.GetChannelRecordingTranscript, ref.id)
  if (ref.kind === "group") return urlsOf(CallsRecordingGet.GetGrpChatRecordingMedia, CallsRecordingGet.GetGrpChatRecordingTranscript, ref.id)
  const peer = ref.id.split(" ").find((id) => id && id !== selfUUID) || selfUUID || ""
  return urlsOf(CallsRecordingGet.GetChatRecordingMedia, CallsRecordingGet.GetChatRecordingTranscript, peer)
}

/** A recording's conversation: a channel, a group (more than two people) or a DM. */
export function refOfRecording(rec: RecordingInfoInterface): ConversationCallRef {
  if (rec.recording_channel?.ch_uuid) return { kind: "channel", id: rec.recording_channel.ch_uuid }
  const people = rec.recording_dm?.dm_participants || []
  if (people.length > 2) return { kind: "group", id: rec.recording_dm.dm_grouping_id }
  return { kind: "dm", id: people.map((p) => p.user_uuid).join(" ") }
}
