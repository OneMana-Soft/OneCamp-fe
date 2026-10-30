"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useDispatch, useSelector, useStore } from "react-redux"
import type { VListHandle } from "virtua"
import { MessageList } from "@/components/conversation/MessageList"
import { SystemLineRow } from "@/components/message/systemLineRow"
import { mentionsUser } from "@/components/message/tintMentions"
import { useAuthorsSeen } from "@/components/message/useAuthorsSeen"
import { useUnreadAnchor } from "@/components/message/useUnreadAnchor"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { adapterOf, type ConversationAdapter } from "@/lib/conversation/adapters"
import { collapseLineRuns, type LineRuns } from "@/lib/conversation/lineRuns"
import { withSharedHistory } from "@/lib/conversation/sharedHistory"
import { isSystemLine } from "@/lib/conversation/systemLine"
import type { ConversationRef, Message, PageWay } from "@/lib/conversation/types"
import { messageSummary } from "@/lib/chat/messageSummary"
import { rowKey } from "@/lib/chat/pendingSend"
import { withContinuation } from "@/lib/messageGrouping"
import { getGroupDateHeading } from "@/lib/utils/date/getMessageGroupDate"
import { groupByDate } from "@/lib/utils/date/groupByDate"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { GetEndpointUrl } from "@/services/endPoints"
import { goesToEnd, goToEnd, listIdOf } from "@/store/conversations"
import { updateChatScrollPosition } from "@/store/slice/chatSlice"
import type { RootState } from "@/store/store"
import type { FlatItem, RowMeta } from "@/types/virtual"
import type { UserProfileInterface } from "@/types/user"

// Each row read once as the one message shape, while it stays the same row:
// the store never changes a row in place.
const read = new WeakMap<object, Message>()

/** What a conversation's rows are given by its list (components/conversation/ConversationMessages). */
export interface ConversationRowsProps<Row> {
    conversation: ConversationRef
    /** Oldest first. */
    rows: Row[]
    older: PageWay
    newer: PageWay
    /** Jump to latest. */
    toLatest: () => void
    /** Unread when it was opened: the "New" line goes above the first of them. */
    unreadOnOpen?: number
    /** The message a link opened it at (MessageList anchor). */
    anchor?: string
    isAdmin?: boolean
}

/** What a kind draws in its list, and does from it (ChannelRows, ChatRows). */
export interface RowsParts<Row> {
    /** A person's message; the list draws system lines itself. */
    renderRow: (row: Row, meta: RowMeta) => ReactNode
    /** The list's name for a screen reader. */
    label: string
    /** The unread banner's Mark as read (chat B27): read, here and everywhere. */
    markRead: () => void
    /** An empty conversation, and the start of one whose history is all loaded. */
    empty: ReactNode
    start: ReactNode
    /** Under the conversation's newest row, whichever kind of row it is: a chat's read receipt. */
    last?: (row: Row) => ReactNode
}

/**
 * A conversation's rows (chat A1 step 2b), whichever kind: by day, a run of
 * joins and leaves as one line (B28), the "New" line where the reader left off
 * (B27), the same author's messages within five minutes as one turn, a shared
 * history's copies under their heading, and where the reader was, kept. It
 * reads each row as the one message shape through the kind's adapter; the kind
 * draws its own messages (RowsParts). It took the place of each kind's own
 * rows (ChannelMessages, ChatMessages, GroupChatMessages).
 */
export function ConversationRows<Row>({ conversation, rows, older, newer, toLatest, unreadOnOpen, anchor, parts }: ConversationRowsProps<Row> & { parts: RowsParts<Row> }) {
    const adapter = adapterOf(conversation) as unknown as ConversationAdapter<Row>
    const msgOf = useCallback((row: Row): Message => {
        let m = read.get(row as object)
        if (!m) {
            m = adapter.toMessage(row)
            read.set(row as object, m)
        }
        return m
    }, [adapter])

    const dispatch = useDispatch()
    const listId = listIdOf(conversation)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfUUID = selfProfile.data?.data?.user_uuid
    const goingToEnd = useSelector((state: RootState) => goesToEnd(state, conversation))

    // Who wrote what is on screen, for avatars and names elsewhere: told to the
    // store once per person, not once per person on every new message.
    useAuthorsSeen(rows, (r) => msgOf(r).from, selfUUID)

    const byDay = useMemo(() => {
        try {
            return groupByDate(rows, (r) => msgOf(r).createdAt)
        } catch (error) {
            console.error("Error grouping messages:", error)
            return {} as Record<string, Row[]>
        }
    }, [rows, msgOf])

    // The message the "New" line sits above, fixed on opening; a Mark unread
    // names the conversation by its id (a DM's grouping id, not its list's).
    const unreadAt = useUnreadAnchor(rows, unreadOnOpen, (r) => msgOf(r).from?.user_uuid === selfUUID, (r) => rowKey(msgOf(r).localId, msgOf(r).uuid), { conversation: conversation.id, idOf: (r) => msgOf(r).uuid })

    // A run of joins and leaves is one line, never across a day (B28).
    const lineRuns = useMemo<LineRuns>(() => {
        const all: LineRuns = { words: new Map(), hidden: new Set() }
        Object.keys(byDay).forEach((date) => {
            const runs = collapseLineRuns(byDay[date].map((r) => {
                const m = msgOf(r)
                return { id: m.uuid, at: m.createdAt, text: m.bodyText, system: isSystemLine(m.kind) ? m.system : undefined }
            }))
            runs.words.forEach((w, id) => all.words.set(id, w))
            runs.hidden.forEach((id) => all.hidden.add(id))
        })
        return all
    }, [byDay, msgOf])

    const flatItems = useMemo(() => {
        const items: Array<FlatItem<Row>> = []
        Object.keys(byDay).forEach((date) => {
            items.push({ type: "separator", date, key: "separator" + date })
            byDay[date].forEach((row) => {
                const m = msgOf(row)
                if (lineRuns.hidden.has(m.uuid)) return
                const key = rowKey(m.localId, m.uuid)
                if (key === unreadAt) items.push({ type: "unread", key: "unread" })
                items.push({ type: "item", data: row, key })
            })
        })
        // Same author within five minutes: drawn as one turn (lib/messageGrouping).
        // A system line is nobody's turn, so nothing groups with it; a shared
        // history's copies sit under their heading (lib/conversation).
        return withContinuation(withSharedHistory(items, (r) => !!msgOf(r).copyOf), (r) => {
            const m = msgOf(r)
            return { author: isSystemLine(m.kind) ? null : m.from?.user_uuid, at: m.createdAt, isBot: !!m.from?.is_bot, standalone: !!(m.replyTo || m.fwdMsgPost || m.fwdMsgChat) }
        })
    }, [byDay, unreadAt, lineRuns, msgOf])

    const { renderRow, label, markRead, empty, start, last } = parts
    // Under the newest row only while nothing newer is to load.
    const under = newer.has ? undefined : last
    const renderItem = useCallback((row: Row, meta: RowMeta) => {
        const m = msgOf(row)
        return (
            <div>
                {isSystemLine(m.kind) ? <SystemLineRow html={lineRuns.words.get(m.uuid) ?? m.bodyText} facts={m.system} /> : renderRow(row, meta)}
                {meta.isLast && under?.(row)}
            </div>
        )
    }, [msgOf, lineRuns.words, renderRow, under])

    // The row that can't be drawn offers its words; the jump pill counts what
    // arrived for the reader; a screen reader hears each message, and whose
    // sends are the reader's (SD-53, SD-54).
    const rawText = useCallback((r: Row) => msgOf(r).bodyText, [msgOf])
    const isForMe = useCallback((r: Row) => mentionsUser(msgOf(r).bodyText, selfUUID, msgOf(r).from?.user_uuid), [msgOf, selfUUID])
    const rowLabel = useCallback((r: Row) => {
        const m = msgOf(r)
        return isSystemLine(m.kind) ? htmlToPreviewText(m.bodyText, 400) : messageSummary({ from: m.from, at: m.createdAt, html: m.bodyText, files: m.attachments?.length })
    }, [msgOf])
    const isOwn = useCallback((r: Row) => !!selfUUID && msgOf(r).from?.user_uuid === selfUUID, [msgOf, selfUUID])
    const timeOf = useCallback((r: Row) => msgOf(r).createdAt, [msgOf])

    const containerRef = useRef<VListHandle>(null)
    useEffect(() => {
        if (goingToEnd && containerRef.current) {
            dispatch(goToEnd(conversation, false))
            containerRef.current.scrollToIndex(flatItems.length - 1, { align: "end" })
        }
    }, [goingToEnd, conversation, dispatch, flatItems.length])

    // Where the reader left this conversation, read once on opening: it is
    // written on every scroll, and subscribing re-rendered the list each time.
    const store = useStore<RootState>()
    const [scrollPosition] = useState(() => store.getState().chat.chatScrollPositions[listId])
    const initialIndex = useMemo(() => {
        if (!scrollPosition?.key) return undefined
        const index = flatItems.findIndex((item) => item.key === scrollPosition.key)
        return index !== -1 ? index : undefined
    }, [flatItems, scrollPosition])
    const handleScroll = useCallback((key: string, offset: number) => {
        dispatch(updateChatScrollPosition({ chatId: listId, key, offset }))
    }, [listId, dispatch])
    const debouncedHandleScroll = useMemo(() => debounceUtil(handleScroll, 200), [handleScroll])
    useEffect(() => debouncedHandleScroll.cancel, [debouncedHandleScroll])

    return (
        <MessageList
            items={flatItems}
            renderItem={renderItem}
            rawText={rawText}
            isForMe={isForMe}
            label={label}
            rowLabel={rowLabel}
            isOwn={isOwn}
            retryOlder={older.retry}
            anchor={anchor}
            timeOf={timeOf}
            onMarkRead={markRead}
            unreadKnown={unreadOnOpen !== undefined}
            getDateHeading={getGroupDateHeading}
            fetchOlderMessage={older.ask}
            fetchNewMessage={newer.ask}
            hasNewMessage={newer.has}
            hasOldMessage={older.has}
            olderMessageLoading={older.loading}
            newMessageLoading={newer.loading}
            ref={containerRef}
            clickedScrollToBottom={toLatest}
            initialTopMostItemIndex={initialIndex}
            initialScrollOffsetFromTop={scrollPosition?.offset}
            onScroll={debouncedHandleScroll}
            empty={empty}
            start={start}
        />
    )
}
