"use client"

import { useParams } from "next/navigation"
import { ChatView } from "@/components/views/ChatView"
import { ConversationView, useDmConversation } from "@/components/conversation/ConversationView"

export default function Page() {
    const params = useParams()
    const chatId = params?.["chat-id"] as string
    const conversation = useDmConversation(chatId)
    return (
        <ConversationView conversation={conversation}>
            <ChatView chatId={chatId} />
        </ConversationView>
    )
}
