"use client"

import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { RecordingsView } from "@/components/recording/RecordingsView"

/** Recordings of calls in this conversation, in the one recordings UI. */
export const ChatRecording = ({ chatId }: { chatId: string }) => {
    const post = usePost()
    return (
        <RecordingsView
            listUrl={`${GetEndpointUrl.ChatRecordingList}/${chatId}`}
            playerUrls={() => ({
                media: `${GetEndpointUrl.GetChatRecordingMedia}/${chatId}`,
                transcript: `${GetEndpointUrl.GetChatRecordingTranscript}/${chatId}`,
            })}
            subtitle="Calls recorded in this conversation."
            onDelete={(egressId) => post.makeRequest({ apiEndpoint: PostEndpointUrl.DeleteChatRecording, appendToUrl: `/${egressId}`, showToast: true }).then((answer) => { if (!answer) throw new Error("not deleted") })}
        />
    )
}
