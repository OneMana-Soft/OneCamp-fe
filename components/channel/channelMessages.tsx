"use client"

// src/components/channel/ChannelMessages.tsx
import { withContinuation } from "@/lib/messageGrouping"
import { rowKey } from "@/lib/chat/pendingSend"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import { groupByDate } from "@/lib/utils/date/groupByDate"
import { getGroupDateHeading } from "@/lib/utils/date/getMessageGroupDate"
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import type { PostsRes } from "@/types/post"
import { ChannelMessage } from "@/components/channel/chanelMessage"
import type { FlatItem, RowMeta } from "@/types/virtual"
import { useMedia } from "@/context/MediaQueryContext"
import { ChannelMessageMobile } from "@/components/channel/channelMessageMobile"
import { usePost } from "@/hooks/usePost"
import { useSaveEdit } from "@/hooks/useSaveEdit"
import { useDeleteMessage } from "@/hooks/useDeleteMessage"
import { REACTION_NOT_ADDED, REACTION_NOT_REMOVED } from "@/lib/chat/reactionNotAdded"
import type { CreateOrUpdatePostReaction } from "@/types/reaction"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
    createPostReactionPostId,
    removePostReactionByPostId,
    updateChannelScrollToBottom,
    updatePostReactionPostId,
    updatePostReactionId,
    ScrollToBottom
} from "@/store/slice/channelSlice"
import {updateChatScrollPosition} from "@/store/slice/chatSlice";
import { useDispatch, useSelector, useStore } from "react-redux"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { MessageListVirtua } from "@/components/message/MessaageListVirtua"
import { mentionsUser } from "@/components/message/tintMentions"
import type { VListHandle } from "virtua"
import type { RootState } from "@/store/store"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useToast } from "@/hooks/use-toast"
import { useAuthorsSeen } from "@/components/message/useAuthorsSeen"
import { useUnreadAnchor } from "@/components/message/useUnreadAnchor"
import { ChannelEmpty } from "@/components/message/emptyConversations"
import { hueFor } from "@/lib/campHue"
import { messageSummary } from "@/lib/chat/messageSummary"

interface ChannelMessagesProps {
    posts: PostsRes[]
    channelId: string
    isAdmin?: boolean
    getOldMessages: () => void
    hasMoreOldMsg: boolean
    getNewMessages: () => void
    hasMoreNewMsg: boolean
    isNewMsgLoading: boolean
    isOLdMsgLoading: boolean
    clickedScrollToBottom: () => void;
    /** Unread when the conversation was opened: the "New" line goes above the first of them. */
    unreadOnOpen?: number;
    /** Set when the older page failed: the list offers Try again (SD-BUG-1). */
    retryOlder?: () => void
}

const EMPTY_SCROLL_TO_BOTTOM: ScrollToBottom = { shouldScrollToBottom: false }

export const ChannelMessages = ({
                                    posts,
                                    channelId,
                                    isAdmin,
                                    hasMoreNewMsg,
                                    getNewMessages,
                                    hasMoreOldMsg,
                                    getOldMessages,
                                    clickedScrollToBottom,
                                    isNewMsgLoading,
                                    isOLdMsgLoading,
                                    unreadOnOpen,
                                    retryOlder,
                                }: ChannelMessagesProps) => {
    const { isMobile } = useMedia()

    const pendingReactionDeletes = useRef<Set<string>>(new Set())


    const post = usePost()
    const saveEdit = useSaveEdit()
    const deleteMessage = useDeleteMessage()

    const { toast } = useToast()
    const dispatch = useDispatch()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const channelScrollToBottom = useSelector((state: RootState) => state.channel.channelScrollToBottom[channelId] || EMPTY_SCROLL_TO_BOTTOM)
    // For an empty channel's words: its name, as the sidebar knows it.
    const channelName = useSelector((state: RootState) => state.users.userSidebar.userChannels?.find((c) => c.ch_uuid === channelId)?.ch_name)

    // Who wrote what is on screen, for avatars and names elsewhere: told to the
    // store once per person, not once per person on every new message.
    useAuthorsSeen(posts, (p) => p.post_by, selfProfile.data?.data.user_uuid)

    // Stable for the life of the conversation (they read the latest posts when
    // they run), so the rows they are handed to stay memoised.
    const createOrUpdateReaction = useStableCallback((postId: string, emojiId: string, reactionId: string) => {
        if (!postId) return

        let tempId = ""
        let oldEmojiId = ""

        // Duplicate check for new reactions
        if (!reactionId) {
            const targetPost = posts.find((p) => p.post_uuid === postId)
            const hasReaction = targetPost?.post_reactions?.some(
                (r) =>
                    r.reaction_emoji_id === emojiId &&
                    r.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid
            )
            if (hasReaction) return
        }

        if (reactionId) {
            // Optimistic Update: Store old state for revert
            const targetPost = posts.find((p) => p.post_uuid === postId)
            const reaction = targetPost?.post_reactions?.find((r) => r.uid === reactionId)
            oldEmojiId = reaction?.reaction_emoji_id || ""

            dispatch(updatePostReactionPostId({ channelId, reactionId, emojiId, postId }))
        } else if (selfProfile.data?.data) {
            // Optimistic Create
            tempId = `temp-${Date.now()}`
            dispatch(
                createPostReactionPostId({
                    postId,
                    channelId,
                    reactionId: tempId,
                    emojiId,
                    addedBy: selfProfile.data?.data,
                })
            )
        }

        post
            .makeRequest<CreateOrUpdatePostReaction, CreateOrUpdatePostReaction>({
                apiEndpoint: PostEndpointUrl.CreateOrUpdatePostReaction,
                payload: {
                    post_id: postId,
                    reaction_emoji_id: emojiId,
                    reaction_dgraph_id: reactionId,
                },
                // A refusal says so in the error toast (QA F-14).
                showErrorToast: true,
                failureTitle: REACTION_NOT_ADDED.title,
            })
            .then((res) => {
                // An answer without the new reaction's id is a failure too: the
                // pill goes back and a toast says so (design v3 chat, C21). It
                // used to stay forever, or take the conversation down.
                if (!reactionId && !res?.reaction_dgraph_id) {
                    toast(REACTION_NOT_ADDED)
                    throw new Error("no reaction id")
                }
                if (reactionId) {
                   // Update success
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data) {
                    // Create success: Swap temp ID with real ID
                    const realId = res.reaction_dgraph_id
                    dispatch(
                        updatePostReactionId({
                            channelId,
                            postId,
                            oldReactionId: tempId,
                            newReactionId: realId,
                        })
                    )

                    // Check if user tried to delete this reaction while it was creating
                    if (pendingReactionDeletes.current.has(tempId)) {
                        pendingReactionDeletes.current.delete(tempId)
                        removeReaction(postId, realId)
                    }
                }
            })
            .catch(() => {
                // Revert on failure
                if (reactionId) {
                    if (oldEmojiId) {
                        dispatch(updatePostReactionPostId({ channelId, reactionId, emojiId: oldEmojiId, postId }))
                    }
                } else {
                    dispatch(removePostReactionByPostId({ channelId, reactionId: tempId, postId }))
                }
            })
    })

    const removeReaction = useStableCallback((postId: string, reactionId: string) => {
        // Handle Race Condition: Removing a temp reaction
        if (reactionId.startsWith("temp-")) {
            pendingReactionDeletes.current.add(reactionId)
            // Optimistically remove from UI
            dispatch(removePostReactionByPostId({ channelId: channelId, reactionId, postId }))
            return
        }

        // Store reaction data to revert if checks fail
        const reactionToRemove = posts
            .find((p) => p.post_uuid === postId)
            ?.post_reactions?.find((r) => r.uid === reactionId)

        dispatch(removePostReactionByPostId({ channelId: channelId, reactionId, postId }))

        post
            .makeRequest<CreateOrUpdatePostReaction>({
                apiEndpoint: PostEndpointUrl.RemovePostReaction,
                payload: {
                    post_id: postId,
                    reaction_dgraph_id: reactionId,
                },
                showErrorToast: true,
                failureTitle: REACTION_NOT_REMOVED,
            })
            .then(() => {
               // Success
            })
            .catch(() => {
                // Revert: Add it back
                if (reactionToRemove) {
                    dispatch(
                        createPostReactionPostId({
                            postId,
                            channelId,
                            reactionId,
                            emojiId: reactionToRemove.reaction_emoji_id,
                            addedBy: reactionToRemove.reaction_added_by,
                        })
                    )
                }
            })
    })

    // It leaves at once; a refused delete puts it back (QA F-01).
    const executeDeletePost = (postId: string) => {
        void deleteMessage({ kind: "post", channelId, id: postId })
    }

    // A correction shows at once and, when its save fails, goes back with
    // the box open on what was typed (hooks/useSaveEdit, F-06, F-07).
    const handleUpdatePost = useStableCallback((html: string, postId: string) => saveEdit({ kind: "post", channelId, id: postId }, html))

    // Deleting is confirmed in place, where Delete was chosen: a computer's
    // More menu (MessageDesktopDropdown, C20), a phone's sheet (SD-5).
    const deleteNow = useStableCallback((id: string) => {
        if (id) executeDeletePost(id)
    })

    const groupedPosts = useMemo(() => {
        try {
            return groupByDate(posts, (post) => post.post_created_at)
        } catch (error) {
            console.error("Error grouping posts:", error)
            return {}
        }
    }, [posts])

    // The message the "New" line sits above, fixed on opening.
    const selfUUID = selfProfile.data?.data.user_uuid
    const unreadAnchor = useUnreadAnchor(posts, unreadOnOpen, (p) => p.post_by?.user_uuid === selfUUID, (p) => rowKey(p.post_local_id, p.post_uuid))

    const flatItems = useMemo(() => {
        const items: Array<FlatItem<PostsRes>> = []
        Object.keys(groupedPosts).forEach((date) => {
            items.push({ type: "separator", date, key: "separator" + date })
            groupedPosts[date].forEach((post) => {
                const key = rowKey(post.post_local_id, post.post_uuid)
                if (key === unreadAnchor) items.push({ type: "unread", key: "unread" })
                items.push({ type: "item", data: post, key })
            })
        })

        // Same author within five minutes: drawn as one turn (lib/messageGrouping).

        return withContinuation(items, (p) => ({ author: p.post_by?.user_uuid, at: p.post_created_at, isBot: !!p.post_by?.is_bot, standalone: !!(p.post_reply_to || p.post_fwd_msg_post || p.post_fwd_msg_chat) }))
    }, [groupedPosts, unreadAnchor])

    const renderItem = useCallback(
        (post: PostsRes, { priority, continued, arrived }: RowMeta) => (
            <div>
                {isMobile ? (
                    <>
                        <ChannelMessageMobile
                            postInfo={post}
                            isAdmin={isAdmin}
                            channelId={channelId}
                            removePost={() => { deleteNow(post.post_uuid) }}
                            addReaction={(emojiId: string, reactionId: string) => {
                                createOrUpdateReaction(post.post_uuid, emojiId, reactionId)
                            }}
                            removeReaction={(reactionId: string) => {
                                removeReaction(post.post_uuid, reactionId)
                            }}
                            updatePost={(body: string) => handleUpdatePost(body, post.post_uuid)}
                            priority={priority}
                            continued={continued}
                        arrived={arrived}
                        />
                    </>
                ) : (
                    <ChannelMessage
                        postInfo={post}
                        isAdmin={isAdmin}
                        addReaction={(emojiId: string, reactionId: string) => {
                            createOrUpdateReaction(post.post_uuid, emojiId, reactionId)
                        }}
                        removeReaction={(reactionId: string) => {
                            removeReaction(post.post_uuid, reactionId)
                        }}
                        removePost={() => { deleteNow(post.post_uuid) }}
                        updatePost={(body: string) => handleUpdatePost(body, post.post_uuid)}
                        priority={priority}
                        continued={continued}
                    arrived={arrived}
                    />
                )}
            </div>
        ),
        [isMobile, isAdmin, channelId, deleteNow, createOrUpdateReaction, removeReaction, handleUpdatePost],
    )
    // The row that can't be drawn offers its words; the jump pill counts
    // what arrived for the reader.
    const rawText = useCallback((m: PostsRes) => m.post_text, [])
    const selfIdForPill = selfProfile.data?.data?.user_uuid
    const isForMe = useCallback((m: PostsRes) => mentionsUser(m.post_text, selfIdForPill), [selfIdForPill])
    // What a screen reader hears of each message, and whose sends are the reader's (SD-53, SD-54).
    const rowLabel = useCallback((m: PostsRes) => messageSummary({ from: m.post_by, at: m.post_created_at, html: m.post_text, files: m.post_attachments?.length }), [])
    const isOwn = useCallback((m: PostsRes) => !!selfIdForPill && m.post_by?.user_uuid === selfIdForPill, [selfIdForPill])

    const containerRef = useRef<VListHandle>(null)

    useEffect(() => {
        if (channelScrollToBottom.shouldScrollToBottom && containerRef.current) {
            dispatch(updateChannelScrollToBottom({ channelId, scrollToBottom: false }))
            containerRef.current.scrollToIndex(flatItems.length - 1, { align: "end" })
        }
    }, [channelScrollToBottom.shouldScrollToBottom, channelId, dispatch, flatItems.length])
    
    const handleGetNewMessage = () => {
        getNewMessages()
    }

    // Where the reader left this conversation, read once on opening: it is
    // written on every scroll, and subscribing re-rendered the list each time.
    const store = useStore<RootState>()
    const [scrollPosition] = useState(() => store.getState().chat.chatScrollPositions[channelId])

    const initialIndex = useMemo(() => {
        if (!scrollPosition?.key) {
            return undefined
        }
        const index = flatItems.findIndex((item) => item.key === scrollPosition.key)
        return index !== -1 ? index : undefined
    }, [flatItems, scrollPosition])

    const handleScroll = useCallback((key: string, offset: number) => {
        dispatch(updateChatScrollPosition({chatId: channelId, key, offset}))
    }, [channelId, dispatch])

    const debouncedHandleScroll = useMemo(() => debounceUtil(handleScroll, 200), [handleScroll])

    return (
        // <MessageList
        //     items={flatItems}
        //     renderItem={renderItem}
        //     getDateHeading={getGroupDateHeading}
        //     fetchOlderMessage={getOldMessages}
        //     fetchNewMessage={getNewMessages}
        //     hasNewMessage={hasMoreNewMsg}
        //     hasOldMessage={hasMoreOldMsg}
        //     olderMessageLoading={isOLdMsgLoading}
        //     newMessageLoading={isNewMsgLoading}
        // />

        <MessageListVirtua
            items={flatItems}
            renderItem={renderItem}
            rawText={rawText}
            isForMe={isForMe}
            label={channelName ? `Messages in #${channelName}` : "Messages"}
            rowLabel={rowLabel}
            isOwn={isOwn}
            retryOlder={retryOlder}
            getDateHeading={getGroupDateHeading}
            fetchOlderMessage={getOldMessages}
            fetchNewMessage={handleGetNewMessage}
            hasNewMessage={hasMoreNewMsg}
            hasOldMessage={hasMoreOldMsg}
            olderMessageLoading={isOLdMsgLoading}
            newMessageLoading={isNewMsgLoading}
            ref={containerRef}
            clickedScrollToBottom={clickedScrollToBottom}
            initialTopMostItemIndex={initialIndex}
            initialScrollOffsetFromTop={scrollPosition?.offset}
            onScroll={debouncedHandleScroll}
            empty={
                <ChannelEmpty channelId={channelId} />
            }
            start={<ChannelEmpty channelId={channelId} start />}
        />
    )
}

ChannelMessages.displayName = "ChannelMessages"
