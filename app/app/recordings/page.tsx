"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { RecordingInfoInterface } from "@/types/recording"
import type { UserProfileInterface } from "@/types/user"
import { RecordingsView } from "@/components/recording/RecordingsView"

/**
 * Every call recorded where you were, in a date range: the one recordings UI
 * (RecordingsView), over the workspace's list.
 */
export default function RecordingsPage() {
    const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const self = selfProfile?.data.user_uuid

    const playerUrls = (rec: RecordingInfoInterface) => {
        if (rec.recording_channel?.ch_uuid) {
            return {
                media: `${GetEndpointUrl.GetChannelRecordingMedia}/${rec.recording_channel.ch_uuid}`,
                transcript: `${GetEndpointUrl.GetChannelRecordingTranscript}/${rec.recording_channel.ch_uuid}`,
            }
        }
        const people = rec.recording_dm?.dm_participants || []
        if (people.length > 2) {
            return {
                media: `${GetEndpointUrl.GetGrpChatRecordingMedia}/${rec.recording_dm.dm_grouping_id}`,
                transcript: `${GetEndpointUrl.GetGrpChatRecordingTranscript}/${rec.recording_dm.dm_grouping_id}`,
            }
        }
        const peer = people.find((p) => p.user_uuid !== self)?.user_uuid || self
        return {
            media: `${GetEndpointUrl.GetChatRecordingMedia}/${peer}`,
            transcript: `${GetEndpointUrl.GetChatRecordingTranscript}/${peer}`,
        }
    }

    return (
        <RecordingsView
            listUrl={GetEndpointUrl.UserRecordingList}
            playerUrls={playerUrls}
            subtitle="Calls recorded in your channels and conversations."
            currentUserId={self}
        />
    )
}
