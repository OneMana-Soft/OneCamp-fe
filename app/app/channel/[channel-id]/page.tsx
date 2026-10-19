"use client"

import { useParams } from "next/navigation"
import { ChannelView } from "@/components/views/ChannelView"
import { ConversationView } from "@/components/conversation/ConversationView"

export default function Page() {
    const params = useParams()
    const channelId = params?.["channel-id"] as string
    return (
        <ConversationView conversation={channelId ? { kind: "channel", id: channelId } : null}>
            <ChannelView channelId={channelId} />
        </ConversationView>
    )
}
