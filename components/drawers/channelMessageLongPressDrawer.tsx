"use client"

import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { MessageActionSheet, type MessageSheetPreview } from "@/components/drawers/messageActionSheet"
import { app_channel_path, app_message_forward_path } from "@/types/paths"

interface Props {
    postUUID: string
    channelUUID: string
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
export function ChannelMessageLongPressDrawer({ drawerOpenState, setOpenState, makeTask, onAddEmoji, copyTextToClipboard, postUUID, channelUUID, editMessage, deleteMessage, isAdmin, isOwner, handleEmojiClick, onReply, messageText, preview }: Props) {
    const threadPath = `${app_channel_path}/${channelUUID}/${postUUID}`
    return (
        <MessageActionSheet
            open={drawerOpenState}
            onOpenChange={setOpenState}
            preview={preview}
            threadPath={threadPath}
            forwardPath={`${app_message_forward_path}/${channelUUID}/${postUUID}`}
            laterTarget={{ itemType: "post", itemId: postUUID, link: threadPath, title: htmlToPreviewText(messageText) || "A message" }}
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
            pin={{ conversation: { kind: "channel", id: channelUUID }, messageId: postUUID }}
        />
    )
}
