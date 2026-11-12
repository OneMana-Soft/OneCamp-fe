"use client"

import type { ComponentProps } from "react"
import { ChannelMessageLongPressDrawer } from "@/components/drawers/channelMessageLongPressDrawer"

/**
 * A channel thread's root, long-pressed on its phone page: the list's sheet
 * (Delete asks first, Follow thread), with no tile for the thread it is on.
 * Its props are UnifiedUIManager's, as they were.
 */
export function PostMessageLongPressDrawer(props: ComponentProps<typeof ChannelMessageLongPressDrawer>) {
    return <ChannelMessageLongPressDrawer {...props} inThread />
}
