// src/components/channel/ChannelMessages.tsx
import { withContinuation } from "@/lib/messageGrouping"
import { rowKey } from "@/lib/chat/pendingSend"
import { useEffect, useMemo, useRef, useCallback, useState} from "react";
import {SeenReceiptLine} from "@/components/chat/SeenReceiptLine";
import type {ChatTarget} from "@/lib/chat/conversation";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import {groupByDate} from "@/lib/utils/date/groupByDate";
import {getGroupDateHeading} from "@/lib/utils/date/getMessageGroupDate";
import {FlatItem, RowMeta} from "@/types/virtual";
import {useMedia} from "@/context/MediaQueryContext";
import {usePost} from "@/hooks/usePost";
import { useSaveEdit } from "@/hooks/useSaveEdit"
import { useDeleteMessage } from "@/hooks/useDeleteMessage";
import { REACTION_NOT_ADDED, REACTION_NOT_REMOVED } from "@/lib/chat/reactionNotAdded";
import {CreateOrUpdateChatReaction} from "@/types/reaction";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector, useStore} from "react-redux";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import { MessageList } from "@/components/conversation/MessageList"
import { isSystemLine } from "@/lib/conversation/systemLine"
import { withSharedHistory } from "@/lib/conversation/sharedHistory"
import { SystemLineRow } from "@/components/message/systemLineRow"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import { mentionsUser } from "@/components/message/tintMentions";
import {VListHandle} from "virtua";
import {RootState} from "@/store/store";
import {ChatInfo} from "@/types/chat";
import {
    createGroupChatReactionChatId,
    removeGroupChatReactionByChatId, updateGroupChatReactionByChatId, updateGroupChatScrollToBottom, updateGroupChatReactionId
} from "@/store/slice/groupChatSlice";
import {updateChatScrollPosition} from "@/store/slice/chatSlice";
import {GroupChatMessage} from "@/components/groupChat/groupChatMessage";
import {ScrollToBottom} from "@/store/slice/channelSlice";
import {GroupChatMessageMobile} from "@/components/groupChat/groupChatMessageMobile";
import { useStableCallback } from "@/hooks/useStableCallback"
import { useToast } from "@/hooks/use-toast";
import { GroupEmpty } from "@/components/message/emptyConversations";
import { useUnreadAnchor } from "@/components/message/useUnreadAnchor";
import { messageSummary } from "@/lib/chat/messageSummary";


interface ChannelMessagesProps {
    chats: ChatInfo[];
    grpId: string
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

export const GroupChatMessages = ({ chats, clickedScrollToBottom, grpId,  hasMoreNewMsg, getNewMessages, hasMoreOldMsg, getOldMessages, isNewMsgLoading, isOLdMsgLoading, unreadOnOpen, retryOlder }: ChannelMessagesProps) => {
    const { isMobile } = useMedia();

    const pendingReactionDeletes = useRef<Set<string>>(new Set())

    const post = usePost()
    const saveEdit = useSaveEdit()
    const deleteMessage = useDeleteMessage()

    const { toast } = useToast()
    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const channelScrollToBottom = useSelector((state: RootState) => state.groupChat.chatScrollToBottom[grpId] || EMPTY_SCROLL_TO_BOTTOM);

    // Stable for the life of the conversation, so the memoised rows stay put.
    const createOrUpdateReaction = useStableCallback((messageId: string, emojiId:string, reactionId:string)=> {
        if(!messageId) return

        let tempId = ""
        let oldEmojiId = ""

        // Duplicate check
        if (!reactionId) {
            const targetChat = chats.find((c) => c.chat_uuid === messageId)
            const hasReaction = targetChat?.chat_reactions?.some(
                (r) =>
                    r.reaction_emoji_id === emojiId &&
                    r.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid
            )
            if (hasReaction) return
        }

        if (reactionId) {
            // Optimistic Update
            const targetChat = chats.find((c) => c.chat_uuid === messageId)
            const reaction = targetChat?.chat_reactions?.find((r) => r.uid === reactionId)
            oldEmojiId = reaction?.reaction_emoji_id || ""

            dispatch(updateGroupChatReactionByChatId({grpId, reactionId, emojiId, messageId}))
        } else if (selfProfile.data?.data) {
             // Optimistic Create
            tempId = `temp-${Date.now()}`
            dispatch(createGroupChatReactionChatId({
                grpId,
                messageId,
                reactionId: tempId,
                emojiId,
                addedBy: selfProfile.data?.data
            }))
        }

        post.makeRequest<CreateOrUpdateChatReaction, CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatReaction,
            payload :{
                chat_id: messageId,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
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
                if(reactionId) {
                   // Success
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                     // Create success: Swap temp ID with real ID
                    const realId = res.reaction_dgraph_id
                    dispatch(updateGroupChatReactionId({
                        grpId,
                        messageId,
                        oldReactionId: tempId,
                        newReactionId: realId
                    }))

                     // Check pending deletes
                    if (pendingReactionDeletes.current.has(tempId)) {
                        pendingReactionDeletes.current.delete(tempId)
                        removeReaction(messageId, realId)
                    }
                }
            })
            .catch(() => {
                // Revert
                if (reactionId) {
                    if (oldEmojiId) {
                        dispatch(updateGroupChatReactionByChatId({grpId, reactionId, emojiId: oldEmojiId, messageId}))
                    }
                } else {
                    dispatch(removeGroupChatReactionByChatId({ grpId, messageId, reactionId: tempId}))
                }
            })
    })

    const removeReaction = useStableCallback((messageId: string, reactionId:string) => {
         // Handle Race Condition
        if (reactionId.startsWith("temp-")) {
            pendingReactionDeletes.current.add(reactionId)
            dispatch(removeGroupChatReactionByChatId({ grpId, messageId, reactionId}))
            return
        }

        // Store reaction data to revert
        const reactionToRemove = chats
            .find((c) => c.chat_uuid === messageId)
            ?.chat_reactions?.find((r) => r.uid === reactionId)

        dispatch(removeGroupChatReactionByChatId({ grpId, messageId, reactionId}))

        post.makeRequest<CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.RemoveChatReaction,
            payload :{
                chat_id: messageId,
                reaction_dgraph_id: reactionId
            },
            showErrorToast: true,
            failureTitle: REACTION_NOT_REMOVED,
        })
            .then(()=>{
               // Success
            })
            .catch(() => {
                // Revert
                 if (reactionToRemove) {
                    dispatch(createGroupChatReactionChatId({
                        grpId,
                        messageId,
                        reactionId,
                        emojiId: reactionToRemove.reaction_emoji_id,
                        addedBy: reactionToRemove.reaction_added_by
                    }))
                }
            })
    })

    // It leaves at once, with its sidebar preview; a refused delete puts both
    // back, as in a channel or a DM (QA F-02).
    const executeDeleteChat = (messageId: string) => {
        void deleteMessage({ kind: "group", grpId, id: messageId })
    }

    // A correction shows at once and, when its save fails, goes back with
    // the box open on what was typed (hooks/useSaveEdit, F-06, F-07).
    const handleUpdateChat = useStableCallback((html: string, messageId: string) => saveEdit({ kind: "group", grpId, id: messageId }, html))


    // Deleting is confirmed in place, where Delete was chosen: a computer's
    // More menu (MessageDesktopDropdown, C20), a phone's sheet (SD-5).
    const deleteNow = useStableCallback((id: string) => {
        if (id) executeDeleteChat(id)
    })

    const groupedChats = useMemo(() => {
        try {
            return groupByDate(chats, (chat) => chat.chat_created_at);
        } catch (error) {
            console.error("Error grouping chats:", error);
            return {};
        }
    }, [chats]);

    // The message the "New" line sits above, fixed on opening.
    const selfUUID = selfProfile.data?.data.user_uuid;
    const unreadAnchor = useUnreadAnchor(chats, unreadOnOpen, (c) => c.chat_from?.user_uuid === selfUUID, (c) => rowKey(c.chat_local_id, c.chat_uuid));

    const flatItems = useMemo(() => {
        const items: Array<FlatItem<ChatInfo>> = [];
        Object.keys(groupedChats).forEach((date) => {
            items.push({ type: "separator", date, key:  "separator"+date});
            groupedChats[date].forEach((chat) => {
                const key = rowKey(chat.chat_local_id, chat.chat_uuid);
                if (key === unreadAnchor) items.push({ type: "unread", key: "unread" });
                items.push({ type: "item", data: chat, key });
            });
        });
        // Same author within five minutes: drawn as one turn (lib/messageGrouping).
        // A system line is nobody's turn, so nothing groups with it; a shared
        // history's copies sit under their heading (lib/conversation).
        return withContinuation(withSharedHistory(items, (c) => !!c.chat_copy_of), (c) => ({ author: isSystemLine(c.chat_kind) ? null : c.chat_from?.user_uuid, at: c.chat_created_at, isBot: !!c.chat_from?.is_bot, standalone: !!(c.chat_reply_to || c.chat_fwd_msg_post || c.chat_fwd_msg_chat) }))
    }, [groupedChats, unreadAnchor]);

    // Read receipts: whose they are (a DM by the other person, a group by its id).
    const receiptTarget = useMemo<ChatTarget>(() => ({ kind: "group", grpId }), [grpId]);

    const renderItem = useCallback((chat: ChatInfo, { priority, isLast, continued, arrived }: RowMeta) => (
        <div>
            {isSystemLine(chat.chat_kind) ? <SystemLineRow html={chat.chat_body_text} facts={chat.chat_system} /> : isMobile ?
                <>
                    <GroupChatMessageMobile
                        chatInfo={chat}
                        removeChat={() => { deleteNow(chat.chat_uuid) }}
                        addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                        removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                        updateChat={(body: string) => handleUpdateChat(body, chat.chat_uuid)}
                        priority={priority}
                        continued={continued}
                        arrived={arrived}
                        grpId={grpId}
                    />
                </>
                :
                <GroupChatMessage
                    chatInfo={chat}
                    addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                    removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                    removePost={() => { deleteNow(chat.chat_uuid) }}
                    updatePost={(body: string) => handleUpdateChat(body, chat.chat_uuid)}
                    grpId={grpId}
                    priority={priority}
                    continued={continued}
                    arrived={arrived}
                />
            }
            {isLast && !hasMoreNewMsg && <SeenReceiptLine target={receiptTarget} latest={chat} />}
        </div>
    ), [isMobile, grpId, hasMoreNewMsg, receiptTarget, deleteNow, createOrUpdateReaction, removeReaction, handleUpdateChat]);

    // The row that can't be drawn offers its words; the jump pill counts
    // what arrived for the reader.
    const rawText = useCallback((m: ChatInfo) => m.chat_body_text, [])
    const selfIdForPill = selfProfile.data?.data?.user_uuid
    const isForMe = useCallback((m: ChatInfo) => mentionsUser(m.chat_body_text, selfIdForPill), [selfIdForPill])
    // What a screen reader hears of each message, and whose sends are the reader's (SD-53, SD-54).
    const rowLabel = useCallback((m: ChatInfo) => isSystemLine(m.chat_kind) ? htmlToPreviewText(m.chat_body_text, 400) : messageSummary({ from: m.chat_from, at: m.chat_created_at, html: m.chat_body_text, files: m.chat_attachments?.length }), [])
    const isOwn = useCallback((m: ChatInfo) => !!selfIdForPill && m.chat_from?.user_uuid === selfIdForPill, [selfIdForPill])

    const containerRef = useRef<VListHandle>(null);

    useEffect(()=>{
        if(channelScrollToBottom.shouldScrollToBottom && containerRef.current) {
            dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: false}))
            containerRef.current.scrollToIndex(flatItems.length - 1, { align: "end" });
        }
    },[channelScrollToBottom.shouldScrollToBottom, grpId, dispatch, flatItems.length])

    const handleGetNewMessage = () => {
        getNewMessages()
    }


    // Where the reader left this conversation, read once on opening: it is
    // written on every scroll, and subscribing re-rendered the list each time.
    const store = useStore<RootState>()
    const [scrollPosition] = useState(() => store.getState().chat.chatScrollPositions[grpId])

    const initialIndex = useMemo(() => {
        if (!scrollPosition?.key) {
            return undefined
        }
        const index = flatItems.findIndex((item) => item.key === scrollPosition.key)
        return index !== -1 ? index : undefined
    }, [flatItems, scrollPosition])

    const handleScroll = useCallback((key: string, offset: number) => {
        dispatch(updateChatScrollPosition({chatId: grpId, key, offset}))
    }, [grpId, dispatch])

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

    <MessageList
        items={flatItems}
        renderItem={renderItem}
        rawText={rawText}
        isForMe={isForMe}
        label="Messages in this group chat"
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
            <GroupEmpty grpId={grpId} />
        }
        start={<GroupEmpty grpId={grpId} start />}
        />


    );
};

GroupChatMessages.displayName = "GroupChatMessages";