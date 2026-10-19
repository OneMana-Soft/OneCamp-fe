"use client"

import { useParams } from "next/navigation"
import { GroupChatView } from "@/components/views/GroupChatView"
import { ConversationView } from "@/components/conversation/ConversationView"

// A group is a fixed set of people (chat A9): adding someone opens the group
// of the new set, and this one keeps its id.
export default function Page() {
    const params = useParams()
    const grpId = params?.["chat-grp-id"] as string
    return (
        <ConversationView conversation={grpId ? { kind: "group", id: grpId } : null}>
            <GroupChatView grpId={grpId} />
        </ConversationView>
    )
}
