"use client"

import { useMedia } from "@/context/MediaQueryContext"
import { Button } from "@/components/ui/button"
import { openUI } from "@/store/slice/uiSlice"
import { MessageCircle, Plus } from "@/lib/icons"
import { useDispatch } from "react-redux"
import { ChatUserList } from "@/components/chat/chatUserList"
import { usePathname } from "next/navigation"
import { useMemo } from "react"

export default function ChatLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    const { isMobile, isDesktop } = useMedia()
    const dispatch = useDispatch()
    const pathname = usePathname()

    const chatId = useMemo(() => {
        const segments = pathname.split("/")
        return segments[3] === "group" ? segments[4] : segments[3]
    }, [pathname])

    if (isMobile) {
        return <>{children}</>
    }

    if (!isDesktop) {
        return <>{children}</>
    }

    return (
        <div className="flex h-full">
            <aside className="flex flex-col w-[300px] xl:w-[320px] h-full border-r border-border/60 bg-background">
                <header className="flex items-center justify-between h-12 md:h-14 px-3 md:px-4 border-b border-border/60">
                    <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        <h1 className="text-sm font-semibold text-foreground">Messages</h1>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="New message"
                        onClick={() => dispatch(openUI({ key: "createChatMessage" }))}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </header>
                <div className="flex-1 overflow-hidden">
                    <ChatUserList chatId={chatId} />
                </div>
            </aside>
            <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
        </div>
    )
}
