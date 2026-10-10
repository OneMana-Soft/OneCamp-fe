"use client"

import { useMedia } from "@/context/MediaQueryContext"
import { ChatUserList } from "@/components/chat/chatUserList"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotInbox } from "@/components/ui/graphics/spots"

export default function ChatPage() {
    const { isDesktop, isMobile } = useMedia()

    if (isMobile) {
        return <ChatUserList chatId={""} />
    }

    if (isDesktop) {
        return (
            // No icon in a circle: the pane is empty because nothing is open,
            // and one line saying where to look is all it needs.
            <div className="flex h-full items-center justify-center">
                <EmptyState
                    illustration={<SpotInbox />}
                    title="No conversation open"
                    description="Pick one from the list, or start a new one with New message."
                />
            </div>
        )
    }

    return null
}
