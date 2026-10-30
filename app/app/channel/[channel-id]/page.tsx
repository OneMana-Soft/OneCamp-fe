"use client"

import { useParams } from "next/navigation"
import { ChannelConversation } from "@/components/conversation/ChannelConversation"
import { ConversationView } from "@/components/conversation/ConversationView"

export default function Page() {
    const params = useParams()
    const channelId = params?.["channel-id"] as string
    return (
        <ConversationView conversation={channelId ? { kind: "channel", id: channelId } : null}>
            <ChannelConversation channelId={channelId} />
        </ConversationView>
    )
}
