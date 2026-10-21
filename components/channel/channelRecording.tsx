"use client"

import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl } from "@/services/endPoints"
import { ChatGet, ChatPost } from "@/services/endpoints/chat"
import type { ChannelInfoInterfaceResp } from "@/types/channel"
import type { RecordingPaginationResRaw } from "@/types/recording"
import { RecordingsView } from "@/components/recording/RecordingsView"

const fromChannel = (res: RecordingPaginationResRaw) => res.channel_info

/** A channel's recordings, in the one recordings UI. Its admins may delete one. */
export const ChannelRecording = ({ channelId }: { channelId: string }) => {
    const post = usePost()
    const { data: info } = useFetch<ChannelInfoInterfaceResp>(`${GetEndpointUrl.ChannelBasicInfo}/${channelId}`)
    const isAdmin = info?.channel_info?.ch_is_admin || false
    const name = info?.channel_info?.ch_name

    return (
        <RecordingsView
            listUrl={`${ChatGet.ChannelRecordingList}/${channelId}`}
            pick={fromChannel}
            playerUrls={() => ({
                media: `${GetEndpointUrl.GetChannelRecordingMedia}/${channelId}`,
                transcript: `${GetEndpointUrl.GetChannelRecordingTranscript}/${channelId}`,
            })}
            subtitle={name ? `Calls recorded in #${name}.` : "Calls recorded in this channel."}
            onDelete={
                isAdmin
                    ? (egressId) => post.makeRequest({ apiEndpoint: ChatPost.DeleteChannelRecording, appendToUrl: `/${egressId}`, showToast: true }).then((answer) => { if (!answer) throw new Error("not deleted") })
                    : undefined
            }
        />
    )
}
