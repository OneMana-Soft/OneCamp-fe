"use client"

import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { MessageActionSheet, type MessageSheetPreview } from "@/components/drawers/messageActionSheet"
import { app_chat_path, app_message_forward_path } from "@/types/paths"
import { chat_forward_type, type UserProfileInterface } from "@/types/user"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { dmWith } from "@/lib/conversation/route"

interface Props {
    otherUserUUID: string
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
export function ChatMessageLongPressDrawer({ drawerOpenState, setOpenState, makeTask, onAddEmoji, copyTextToClipboard, otherUserUUID, chatUUID, editMessage, deleteMessage, isAdmin, isOwner, handleEmojiClick, onReply, messageText, preview }: Props) {
    const threadPath = `${app_chat_path}/${otherUserUUID}/${chatUUID}`
    // The DM, as the conversation service names it: both people's ids.
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
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
            pin={{ conversation: dmWith(otherUserUUID, self), messageId: chatUUID }}
        />
    )
}
