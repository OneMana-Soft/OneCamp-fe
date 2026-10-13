"use client"

import { useParams, usePathname, useRouter } from "next/navigation"
import { GroupChatView } from "@/components/views/GroupChatView"
import { useConversationMoved } from "@/hooks/useConversationMoved"

export default function Page() {
    const params = useParams()
    const grpId = params?.["chat-grp-id"] as string
    const router = useRouter()
    const pathname = usePathname()
    // Someone was added: the group has a new id, and nothing is sent to this one.
    useConversationMoved("group", grpId, (to) => router.replace((pathname || "").replace(grpId, to)))
    return <GroupChatView grpId={grpId} />
}
