"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import { useDispatch } from "react-redux"
import { SeenReceiptLine } from "@/components/chat/SeenReceiptLine"
import { ConversationRows, type ConversationRowsProps, type RowsParts } from "@/components/conversation/ConversationRows"
import { DmEmpty, GroupEmpty } from "@/components/message/emptyConversations"
import { useMedia } from "@/context/MediaQueryContext"
import { markChatSeen } from "@/hooks/useChatReceipts"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useRowActions } from "@/hooks/useRowActions"
import type { ChatTarget } from "@/lib/chat/conversation"
import { receiptsKey } from "@/lib/chat/readReceipts"
import type { ConversationRef } from "@/lib/conversation/types"
import { releaseUnread } from "@/lib/conversation/unreadHold"
import { userDisplayName } from "@/lib/utils/userDisplayName"
import { GetEndpointUrl } from "@/services/endPoints"
import { resetUserChatUnread } from "@/store/slice/userSlice"
import type { ChatInfo } from "@/types/chat"
import type { UserProfileInterface } from "@/types/user"
import type { RowMeta } from "@/types/virtual"

/** What can be done from one message in a DM or a group (hooks/useRowActions). */
export interface ChatMessageActions {
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    remove: () => void
    save: (body: string) => Promise<boolean>
}

/** How a DM or a group draws a person's message, on a phone or a computer (DmRows, GroupRows). */
export type DrawChatMessage = (chat: ChatInfo, act: ChatMessageActions, meta: RowMeta, isMobile: boolean, conversation: ConversationRef) => ReactNode

/**
 * A DM's or a group's rows (chat A1 step 2b): the conversation's rows, with
 * what is done from a message (hooks/useRowActions), the read receipt under
 * the newest, Mark as read, its name for a screen reader and its empty state.
 * Its kind draws only its own messages (DmRows, GroupRows), so a DM's page
 * never loads a group's message components, nor a group's a DM's.
 */
export function ChatRows({ draw, ...props }: ConversationRowsProps<ChatInfo> & { draw: DrawChatMessage }) {
    const ref = props.conversation
    const dm = ref.kind === "dm" ? ref : null
    const { isMobile } = useMedia()
    const dispatch = useDispatch()
    const act = useRowActions(ref)
    // Who a DM is with, for its name: the profile its header already fetched
    // (SWR answers it from cache).
    const other = useFetchOnlyOnce<UserProfileInterface>(dm ? `${GetEndpointUrl.SelfProfile}/${dm.other}` : "")
    const otherName = userDisplayName(other.data?.data) || ""
    // Whose read receipts these are: a DM's by the other person, a group's by its id.
    const target = useMemo<ChatTarget>(() => (ref.kind === "dm" ? { kind: "dm", otherUUID: ref.other } : { kind: "group", grpId: ref.id }), [ref])

    const renderRow = useCallback((chat: ChatInfo, meta: RowMeta) => {
        const id = chat.chat_uuid
        const on: ChatMessageActions = {
            addReaction: (emojiId, reactionId) => act.react(id, emojiId, reactionId),
            removeReaction: (reactionId) => act.unreact(id, reactionId),
            remove: () => act.remove(id),
            save: (body) => act.save(id, body),
        }
        return draw(chat, on, meta, isMobile, ref)
    }, [draw, act, isMobile, ref])

    // The unread banner's Mark as read (chat B27): read, here and everywhere.
    // A DM's and a group's id is the grouping id their count is kept under.
    const markRead = useCallback(() => {
        releaseUnread(ref.id)
        void markChatSeen(receiptsKey(target), ref.id)
        dispatch(resetUserChatUnread({ dm_grouping_id: ref.id }))
    }, [ref.id, target, dispatch])

    // The newest message isn't marked seen until the count of what was unread is read (chat B27).
    const holdSeen = props.unreadOnOpen === undefined
    const parts = useMemo<RowsParts<ChatInfo>>(() => ({
        renderRow,
        label: dm ? (otherName ? `Messages with ${otherName}` : "Messages") : "Messages in this group chat",
        markRead,
        empty: dm ? <DmEmpty chatId={dm.other} /> : <GroupEmpty grpId={ref.id} />,
        start: dm ? <DmEmpty chatId={dm.other} start /> : <GroupEmpty grpId={ref.id} start />,
        last: (chat) => <SeenReceiptLine target={target} latest={chat} hold={holdSeen} />,
    }), [renderRow, dm, otherName, markRead, ref.id, target, holdSeen])

    return <ConversationRows {...props} parts={parts} />
}
