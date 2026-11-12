"use client"

import type { ComponentProps } from "react"
import { ChatMessageLongPressDrawer } from "@/components/drawers/chatMessageLongPressDrawer"

/** A DM thread's root on its phone page: the list's sheet, as postMessageLongPressDrawer is a channel's. */
export function DmChatMessageLongPressDrawer(props: ComponentProps<typeof ChatMessageLongPressDrawer>) {
    return <ChatMessageLongPressDrawer {...props} inThread />
}
