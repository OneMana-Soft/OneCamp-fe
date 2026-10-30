"use client"

import { memo, type ComponentType, type ReactNode } from "react"
import { ChatLoadingSkeleton } from "@/components/chat/ChatLoadingSkeleton"
import type { ConversationRowsProps } from "@/components/conversation/ConversationRows"
import { ConversationLoadError } from "@/components/message/conversationError"
import { useOpenCount } from "@/components/conversation/openCount"
import { useConversation } from "@/hooks/useConversation"
import type { ConversationRef } from "@/lib/conversation/types"

/** A kind's list (chat A1 step 2b): the conversation, and what the kind draws in it. */
export interface ConversationList<Row> {
    ref: ConversationRef
    /** What couldn't be loaded, in the error state: "this channel's messages". */
    subject: string
    /** The kind's rows: ConversationRows with its own parts (ChannelRows, ChatRows). */
    Rows: ComponentType<ConversationRowsProps<Row>>
    /** Who is typing, under the list. */
    typing?: ReactNode
}

interface ConversationMessagesProps<Row> {
    /** Made once per conversation (a page's useMemo): the list redraws only when what it shows changes. */
    list: ConversationList<Row>
    /** The message a link opens it at, when not in the address. */
    link?: string
    isAdmin?: boolean
}

/**
 * A conversation's messages, whichever kind (chat A1 step 2b): its list, paged
 * (hooks/useConversation), drawn by the kind's rows, with who is typing under
 * it; loading until the first answer is in the store, and a failure said as
 * one, never as an empty conversation. It took the place of each kind's own
 * list (ChannelMessageList, ChatMessageList, GroupChatMessageList).
 *
 * Memoised: its props are a made-once list and ids, so a parent re-rendering
 * for another reason (the composer's draft, on every key) never re-renders
 * every message. On a phone that cost up to 300 ms a key.
 */
export const ConversationMessages = memo(function ConversationMessages<Row>({ list, link, isAdmin }: ConversationMessagesProps<Row>) {
    // Unread when it was opened: where the "New" line goes (its kind gives it).
    const unreadOnOpen = useOpenCount()
    const { rows, status, retry, anchor, older, newer, toLatest } = useConversation<Row>(list.ref, link)

    if (status === "loading") {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <ChatLoadingSkeleton />
            </div>
        )
    }
    if (status === "error") return <ConversationLoadError subject={list.subject} retry={retry} />

    const { Rows } = list
    return (
        <div className="flex flex-col h-full gap-y-2 w-full min-w-0">
            <Rows conversation={list.ref} rows={rows} older={older} newer={newer} toLatest={toLatest} isAdmin={isAdmin} unreadOnOpen={unreadOnOpen} anchor={anchor} />
            {list.typing}
        </div>
    )
}) as <Row>(props: ConversationMessagesProps<Row>) => ReactNode
