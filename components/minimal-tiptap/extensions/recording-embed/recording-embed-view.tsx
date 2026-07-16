"use client"

import React from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Video, CheckSquare } from "@/lib/icons"
import type { UserProfileInterface } from "@/types/user"

// RecordingEmbedView renders the "Play recording" block inside a meeting-recap
// message and opens the global recording player on click — in place, no
// navigation. Surface-correct media/transcript URLs are derived from the
// node's attributes; for a DM the recording is addressed by the OTHER
// participant, so we pick the id that isn't the current user.
export const RecordingEmbedView: React.FC<NodeViewProps> = ({ node }) => {
  const dispatch = useDispatch()
  const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile)

  const egress = String(node.attrs.egress || "")
  const kind = String(node.attrs.kind || "")
  const sid = String(node.attrs.sid || "")
  const u1 = String(node.attrs.u1 || "")
  const u2 = String(node.attrs.u2 || "")

  const resolveUrls = (): { mediaGetUrl: string; transcriptGetUrl: string } | null => {
    switch (kind) {
      case "channel":
        if (!sid) return null
        return {
          mediaGetUrl: `${GetEndpointUrl.GetChannelRecordingMedia}/${sid}`,
          transcriptGetUrl: `${GetEndpointUrl.GetChannelRecordingTranscript}/${sid}`,
        }
      case "group":
        if (!sid) return null
        return {
          mediaGetUrl: `${GetEndpointUrl.GetGrpChatRecordingMedia}/${sid}`,
          transcriptGetUrl: `${GetEndpointUrl.GetGrpChatRecordingTranscript}/${sid}`,
        }
      case "dm": {
        const self = selfProfile?.data?.user_uuid
        const peer = u1 && u1 !== self ? u1 : u2
        if (!peer) return null
        return {
          mediaGetUrl: `${GetEndpointUrl.GetChatRecordingMedia}/${peer}`,
          transcriptGetUrl: `${GetEndpointUrl.GetChatRecordingTranscript}/${peer}`,
        }
      }
      default:
        return null
    }
  }

  const handlePlay = () => {
    if (!egress) return
    const urls = resolveUrls()
    if (!urls) return
    dispatch(
      openUI({
        key: "recordingPlayer",
        data: {
          egressId: egress,
          mediaGetUrl: urls.mediaGetUrl,
          transcriptGetUrl: urls.transcriptGetUrl,
          fileName: "Meeting recording",
        },
      }),
    )
  }

  // Reconstruct the LiveKit room name from the surface attributes so the
  // assistant can pull this exact call's transcript. Mirrors the server-side
  // room-name shapes (recapToHTML / recordingPlayAttrs):
  //   - channel/group → the surface id (sid)
  //   - DM            → the space-joined pair of user UUIDs, in stored order
  const roomName = (): string => {
    switch (kind) {
      case "channel":
      case "group":
        return sid
      case "dm":
        return u1 && u2 ? `${u1} ${u2}` : ""
      default:
        return ""
    }
  }

  const handleCreateTasks = () => {
    const rn = roomName()
    if (!rn) return
    dispatch(openUI({ key: "extractTasks", data: { sourceType: "meeting", sourceId: rn } }))
  }

  const canExtract = roomName() !== ""

  return (
    <NodeViewWrapper className="recording-embed" data-drag-handle={false}>
      <span contentEditable={false} className="my-1 inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handlePlay}
          className="inline-flex select-none items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Video className="h-4 w-4" />
          </span>
          <span>Play recording</span>
        </button>
        {canExtract && (
          <button
            type="button"
            onClick={handleCreateTasks}
            title="Turn this meeting's action items into tasks"
            className="inline-flex select-none items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CheckSquare className="h-4 w-4" />
            </span>
            <span>Create tasks</span>
          </button>
        )}
      </span>
    </NodeViewWrapper>
  )
}

export default RecordingEmbedView
