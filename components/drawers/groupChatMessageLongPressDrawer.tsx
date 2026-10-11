"use client"

import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { MessageActionSheet, type MessageSheetPreview } from "@/components/drawers/messageActionSheet"
import { app_grp_chat_path, app_message_forward_path } from "@/types/paths"
import { chat_forward_type } from "@/types/user"

interface Props {
    grpId: string
    chatUUID: string
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    /** Opens the task form drafted from this message. */
    makeTask?: () => void
    onAddEmoji: () => void
    copyTextToClipboard: () => void
    editMessage: () => void
    deleteMessage: () => void
    handleEmojiClick: (emojiId: string) => void
    // Arms the composer for a Discord-style inline reply (distinct from
    // "Thread", which opens the message's thread view).
    onReply?: () => void
    isOwner?: boolean
    isAdmin?: boolean
    messageText?: string
    /** The pressed message, lifted above the sheet (C61). */
    preview?: MessageSheetPreview | null
}

/** A message's actions on a phone: the v3 sheet (components/drawers/messageActionSheet). */
export function GroupChatMessageLongPressDrawer({ drawerOpenState, setOpenState, makeTask, onAddEmoji, copyTextToClipboard, grpId, chatUUID, editMessage, deleteMessage, isAdmin, isOwner, handleEmojiClick, onReply, messageText, preview }: Props) {
    const threadPath = `${app_grp_chat_path}/${grpId}/${chatUUID}`
    return (
        <MessageActionSheet
            open={drawerOpenState}
            onOpenChange={setOpenState}
            preview={preview}
            threadPath={threadPath}
            forwardPath={`${app_message_forward_path}/${chat_forward_type}/${chatUUID}`}
            laterTarget={{ itemType: "chat", itemId: chatUUID, link: threadPath, title: htmlToPreviewText(messageText) || "A message" }}
            onReply={onReply}
            onAddEmoji={onAddEmoji}
            handleEmojiClick={handleEmojiClick}
            makeTask={makeTask}
            copyText={copyTextToClipboard}
            editMessage={editMessage}
            deleteMessage={deleteMessage}
            isOwner={isOwner}
            isAdmin={isAdmin}
            messageText={messageText}
        />
    )
}
