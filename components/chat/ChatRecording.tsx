"use client"

import { usePost } from "@/hooks/usePost"
import { ChatGet, ChatPost } from "@/services/endpoints/chat"
import { RecordingsView } from "@/components/recording/RecordingsView"

/** Recordings of calls in this conversation, in the one recordings UI. */
export const ChatRecording = ({ chatId }: { chatId: string }) => {
    const post = usePost()
    return (
        <RecordingsView
            listUrl={`${ChatGet.ChatRecordingList}/${chatId}`}
            call={{ kind: "dm", id: chatId }}
            subtitle="Calls recorded in this conversation."
            onDelete={(egressId) => post.makeRequest({ apiEndpoint: ChatPost.DeleteChatRecording, appendToUrl: `/${egressId}`, showToast: true }).then((answer) => { if (!answer) throw new Error("not deleted") })}
        />
    )
}
