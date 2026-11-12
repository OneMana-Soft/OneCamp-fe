"use client"

import type { ComponentProps } from "react"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { PostCommentMessageLongPressDrawer } from "@/components/drawers/postCommentMessageLongPressDrawer"

/**
 * A DM thread's reply on its phone page: a channel reply's sheet. UnifiedUIManager
 * hands this one no owner, so its opener's (the sheet's data) decides Edit and
 * Delete: the old drawer offered Edit to anyone and Delete to no one.
 */
export function DmChatCommentMessageLongPressDrawer(props: ComponentProps<typeof PostCommentMessageLongPressDrawer>) {
    const held = useSelector((state: RootState) => state.ui.dmChatCommentLongPress.data)
    return <PostCommentMessageLongPressDrawer {...props} isOwner={props.isOwner ?? held?.isOwner} isAdmin={props.isAdmin ?? held?.isAdmin} />
}
