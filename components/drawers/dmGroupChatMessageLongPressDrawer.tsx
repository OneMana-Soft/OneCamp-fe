"use client"

import type { ComponentProps } from "react"
import { GroupChatMessageLongPressDrawer } from "@/components/drawers/groupChatMessageLongPressDrawer"

/** A group thread's root on its phone page: the list's sheet, as postMessageLongPressDrawer is a channel's. */
export function DmGroupChatMessageLongPressDrawer(props: ComponentProps<typeof GroupChatMessageLongPressDrawer>) {
    return <GroupChatMessageLongPressDrawer {...props} inThread />
}
