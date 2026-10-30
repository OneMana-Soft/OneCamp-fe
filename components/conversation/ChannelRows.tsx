"use client"

import { useCallback, useMemo } from "react"
import { useDispatch, useSelector } from "react-redux"
import { ChannelMessage } from "@/components/channel/chanelMessage"
import { ChannelMessageMobile } from "@/components/channel/channelMessageMobile"
import type { ConversationList } from "@/components/conversation/ConversationMessages"
import { ConversationRows, type ConversationRowsProps, type RowsParts } from "@/components/conversation/ConversationRows"
import { ChannelEmpty } from "@/components/message/emptyConversations"
import { ChannelTypingBar } from "@/components/typingIndicator/typingIndicatorBar"
import { useMedia } from "@/context/MediaQueryContext"
import { useRowActions } from "@/hooks/useRowActions"
import { releaseUnread } from "@/lib/conversation/unreadHold"
import { markChannelSeen } from "@/services/channelService"
import { resetUserChannelUnread } from "@/store/slice/userSlice"
import type { RootState } from "@/store/store"
import type { PostsRes } from "@/types/post"
import type { RowMeta } from "@/types/virtual"

/**
 * A channel's rows (chat A1 step 2b): the conversation's rows, with the
 * channel's own messages, what is done from them (hooks/useRowActions), its
 * name for a screen reader and its empty state.
 */
export function ChannelRows(props: ConversationRowsProps<PostsRes>) {
    const channelId = props.conversation.id
    const { isAdmin } = props
    const { isMobile } = useMedia()
    const dispatch = useDispatch()
    const act = useRowActions(props.conversation)
    // For an empty channel's words: its name, as the sidebar knows it.
    const channelName = useSelector((state: RootState) => state.users.userSidebar.userChannels?.find((c) => c.ch_uuid === channelId)?.ch_name)

    const renderRow = useCallback((p: PostsRes, { priority, continued, arrived }: RowMeta) => {
        const row = {
            postInfo: p,
            isAdmin,
            addReaction: (emojiId: string, reactionId: string) => act.react(p.post_uuid, emojiId, reactionId),
            removeReaction: (reactionId: string) => act.unreact(p.post_uuid, reactionId),
            removePost: () => act.remove(p.post_uuid),
            updatePost: (body: string) => act.save(p.post_uuid, body),
            priority,
            continued,
            arrived,
        }
        return isMobile ? <ChannelMessageMobile {...row} channelId={channelId} /> : <ChannelMessage {...row} />
    }, [isMobile, isAdmin, channelId, act])

    // The unread banner's Mark as read (chat B27): read, here and everywhere.
    const markRead = useCallback(() => {
        releaseUnread(channelId)
        void markChannelSeen(channelId)
        dispatch(resetUserChannelUnread({ ch_uuid: channelId }))
    }, [channelId, dispatch])

    const parts = useMemo<RowsParts<PostsRes>>(() => ({
        renderRow,
        label: channelName ? `Messages in #${channelName}` : "Messages",
        markRead,
        empty: <ChannelEmpty channelId={channelId} />,
        start: <ChannelEmpty channelId={channelId} start />,
    }), [renderRow, channelName, markRead, channelId])

    return <ConversationRows {...props} parts={parts} />
}

/** A channel's list (components/conversation/ConversationMessages); a page makes it once per channel (useMemo). Pure. */
export function channelList(channelId: string): ConversationList<PostsRes> {
    return {
        ref: { kind: "channel", id: channelId },
        subject: "this channel's messages",
        Rows: ChannelRows,
        typing: <ChannelTypingBar channelId={channelId} />,
    }
}
