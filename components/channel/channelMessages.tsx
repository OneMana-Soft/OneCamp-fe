"use client"

// src/components/channel/ChannelMessages.tsx
import { withContinuation } from "@/lib/messageGrouping"
import { rowKey } from "@/lib/chat/pendingSend"
import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import { groupByDate } from "@/lib/utils/date/groupByDate"
import { getGroupDateHeading } from "@/lib/utils/date/getMessageGroupDate"
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import type { CreateOrUpdatePostsReq, CreatePostsRes, PostsRes } from "@/types/post"
import { ChannelMessage } from "@/components/channel/chanelMessage"
import type { FlatItem, RowMeta } from "@/types/virtual"
import { useMedia } from "@/context/MediaQueryContext"
import { ChannelMessageMobile } from "@/components/channel/channelMessageMobile"
import TouchableDiv from "@/components/animation/touchRippleAnimation"
import { usePost } from "@/hooks/usePost"
import type { CreateOrUpdatePostReaction } from "@/types/reaction"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import {
    createPostReactionPostId,
    removePostByPostId,
    removePostReactionByPostId,
    updateChannelScrollToBottom,
    updatePostByPostId,
    updatePostReactionPostId,
    updatePostReactionId,
    ScrollToBottom
} from "@/store/slice/channelSlice"
import {updateChatScrollPosition} from "@/store/slice/chatSlice";
import { useDispatch, useSelector, useStore } from "react-redux"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import type { UserProfileInterface } from "@/types/user"
import { openUI } from "@/store/slice/uiSlice"
import { MessageListVirtua } from "@/components/message/MessaageListVirtua"
import type { VListHandle } from "virtua"
import type { RootState } from "@/store/store"
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import { useStableCallback } from "@/hooks/useStableCallback"
import { useAuthorsSeen } from "@/components/message/useAuthorsSeen"
import { useUnreadAnchor } from "@/components/message/useUnreadAnchor"
import { ConversationEmpty } from "@/components/message/conversationEmpty"
import { hueFor } from "@/lib/campHue"

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
                                }: ChannelMessagesProps) => {
    const { isMobile } = useMedia()

    const pendingReactionDeletes = useRef<Set<string>>(new Set())


    const post = usePost()

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
            })
            .then((res) => {
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

    const executeDeletePost = (postId: string) => {
        // Store for revert if needed
        const postToDelete = posts.find(p => p.post_uuid === postId);

        // Optimistic Delete
        dispatch(removePostByPostId({ postId, channelId }))

        post.makeRequest<CreateOrUpdatePostsReq>({
                apiEndpoint: PostEndpointUrl.DeleteChannelPost,
                payload: {
                    post_id: postId,
                },
                showToast: false,
                showErrorToast: true,
                description: "Deleting post"
            })
            .then((res) => {
                if (!res) {
                    // Revert logic would go here if we had an 'addBackPost' action
                }
            })
            .catch(() => {
                // Revert or notify
            })
    }

    const handleUpdatePost = useStableCallback((postHTMLText: string, postId: string) => {
        // Trim leading/trailing empty paragraphs and whitespace before sending.
        const trimmedHtml = removeEmptyPTags(postHTMLText)
        if (!trimmedHtml) return

        // Store for revert
        const originalPost = posts.find(p => p.post_uuid === postId);
        const originalText = originalPost?.post_text || "";

        // Optimistic Update
        dispatch(
            updatePostByPostId({
                postId: postId,
                channelId: channelId,
                htmlText: trimmedHtml,
            }),
        )

        post
            .makeRequest<CreateOrUpdatePostsReq, CreatePostsRes>({
                apiEndpoint: PostEndpointUrl.UpdateChannelPost,
                payload: {
                    post_id: postId,
                    post_text_html: trimmedHtml,
                },
                showToast: false, // Cleaner UX with optimism
                showErrorToast: true,
                description: "Updating post"
            })
            .then((res) => {
                if (!res) {
                    // Revert
                    dispatch(updatePostByPostId({ postId, channelId, htmlText: originalText }));
                }
            })
            .catch(() => {
                // Revert
                dispatch(updatePostByPostId({ postId, channelId, htmlText: originalText }));
            })
    })

    const handleDeletePost = useStableCallback((postId: string) => {
        if (!postId) return


        setTimeout(() => {
            dispatch(
                openUI({
                    key: 'confirmAlert',
                    data: {
                        title: "Delete this post?",
                        description: "It's removed from the channel for everyone. This can't be undone.",
                        confirmText: "Delete post",
                        destructive: true,
                        onConfirm: () => {
                            setTimeout(() => { executeDeletePost(postId) }, 100)
                        },
                    }
                }),
            )
        }, 500)
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
        (post: PostsRes, { priority, continued }: RowMeta) => (
            <div>
                {isMobile ? (
                    <TouchableDiv rippleBrightness={0.8} rippleDuration={800}>
                        <ChannelMessageMobile
                            postInfo={post}
                            isAdmin={isAdmin}
                            channelId={channelId}
                            removePost={() => {
                                handleDeletePost(post.post_uuid)
                            }}
                            addReaction={(emojiId: string, reactionId: string) => {
                                createOrUpdateReaction(post.post_uuid, emojiId, reactionId)
                            }}
                            removeReaction={(reactionId: string) => {
                                removeReaction(post.post_uuid, reactionId)
                            }}
                            updatePost={(body: string) => {
                                handleUpdatePost(body, post.post_uuid)
                            }}
                            priority={priority}
                            continued={continued}
                        />
                    </TouchableDiv>
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
                        removePost={() => {
                            handleDeletePost(post.post_uuid)
                        }}
                        updatePost={(body: string) => {
                            handleUpdatePost(body, post.post_uuid)
                        }}
                        priority={priority}
                        continued={continued}
                    />
                )}
            </div>
        ),
        [isMobile, isAdmin, channelId, handleDeletePost, createOrUpdateReaction, removeReaction, handleUpdatePost],
    )
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
                <ConversationEmpty
                    hue={hueFor(channelId)}
                    title={channelName ? `No messages in #${channelName} yet` : "No messages yet"}
                    description="What you write below starts the conversation."
                />
            }
        />
    )
}

ChannelMessages.displayName = "ChannelMessages"
