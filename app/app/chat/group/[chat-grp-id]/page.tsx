"use client"

import { useParams } from "next/navigation"
import { GroupChatView } from "@/components/views/GroupChatView"

export default function Page() {
    const params = useParams()
    return <GroupChatView grpId={params?.["chat-grp-id"] as string} />
}
