"use client"

import { MessageActionSheet } from "@/components/drawers/messageActionSheet"

interface ReplySheetProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    copyTextToClipboard: () => void
    editMessage: () => void
    deleteMessage: () => void
    handleEmojiClick: (emojiId: string) => void
    isAdmin?: boolean
    isOwner?: boolean
}

/**
 * A thread's reply, long-pressed on its phone page: the list's sheet with
 * what a reply takes (reactions, Copy text, and its author's Edit and Delete,
 * which asks first). Its props are UnifiedUIManager's, as they were.
 */
export function PostCommentMessageLongPressDrawer({ drawerOpenState, setOpenState, onAddEmoji, copyTextToClipboard, editMessage, deleteMessage, handleEmojiClick, isAdmin, isOwner }: ReplySheetProps) {
    return (
        <MessageActionSheet
            open={drawerOpenState}
            onOpenChange={setOpenState}
            onAddEmoji={onAddEmoji}
            handleEmojiClick={handleEmojiClick}
            copyText={copyTextToClipboard}
            editMessage={editMessage}
            deleteMessage={deleteMessage}
            isOwner={isOwner}
            isAdmin={isAdmin}
        />
    )
}
