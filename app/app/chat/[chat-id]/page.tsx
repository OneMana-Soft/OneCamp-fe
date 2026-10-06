"use client"

import { useParams } from "next/navigation"
import { ChatView } from "@/components/views/ChatView"

export default function Page() {
    const params = useParams()
    return <ChatView chatId={params?.["chat-id"] as string} />
}
