"use client"

import { useMedia } from "@/context/MediaQueryContext"
import { ChatUserList } from "@/components/chat/chatUserList"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageCircle } from "@/lib/icons"

export default function ChatPage() {
    const { isDesktop, isMobile } = useMedia()

    if (isMobile) {
        return <ChatUserList chatId={""} />
    }

    if (isDesktop) {
        return (
            <div className="flex h-full items-center justify-center">
                <EmptyState
                    icon={MessageCircle}
                    title="Select a conversation"
                    description="Choose a chat from the sidebar to start messaging."
                />
            </div>
        )
    }

    return null
}
