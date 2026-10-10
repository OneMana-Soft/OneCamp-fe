"use client"

import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { RecordingsView } from "@/components/recording/RecordingsView"

/** Recordings of calls in this group, in the one recordings UI. */
export const GroupChatRecording = ({ grpId }: { grpId: string }) => {
    const post = usePost()
    return (
        <RecordingsView
            listUrl={`${GetEndpointUrl.GroupChatRecordingList}/${grpId}`}
            playerUrls={() => ({
                media: `${GetEndpointUrl.GetGrpChatRecordingMedia}/${grpId}`,
                transcript: `${GetEndpointUrl.GetGrpChatRecordingTranscript}/${grpId}`,
            })}
            subtitle="Calls recorded in this group."
            onDelete={(egressId) => post.makeRequest({ apiEndpoint: PostEndpointUrl.DeleteGroupChatRecording, appendToUrl: `/${egressId}`, showToast: true }).then((answer) => { if (!answer) throw new Error("not deleted") })}
        />
    )
}
