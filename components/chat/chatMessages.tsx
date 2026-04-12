// src/components/channel/ChannelMessages.tsx
import { useCallback, useEffect, useMemo, useRef, useState} from "react";
import { debounceUtil } from "@/lib/utils/helpers/debounce";
import {groupByDate} from "@/lib/utils/date/groupByDate";
import {getGroupDateHeading} from "@/lib/utils/date/getMessageGroupDate";
import {FlatItem} from "@/types/virtual";
import {useMedia} from "@/context/MediaQueryContext";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {usePost} from "@/hooks/usePost";
import {CreateOrUpdateChatReaction} from "@/types/reaction";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import { openUI } from "@/store/slice/uiSlice";
import {MessageListVirtua} from "@/components/message/MessaageListVirtua";
import {VListHandle} from "virtua";
import {RootState} from "@/store/store";
import {
    createChatReactionChatId, removeChatByChatId,
    removeChatReactionByChatId, updateChatByChatId,
    updateChatReactionByChatId, updateChatScrollToBottom, updateChatScrollPosition, updateChatReactionId,
    RemoveMessageFromChatList, UpdateMessageTextInChatList
} from "@/store/slice/chatSlice";
import {ChatInfo, CreateOrUpdateChatsReq} from "@/types/chat";
import {ChatMessageMobile} from "@/components/chat/chatMessageMobile";
import {ChatMessage} from "@/components/chat/chatMessage";
import {toast} from "@/hooks/use-toast";
import {updateUserInfoStatus} from "@/store/slice/userSlice";
import {getGroupingId} from "@/lib/utils/getGroupingId";

// Stable empty object reference to prevent unnecessary re-renders
const EMPTY_SCROLL_TO_BOTTOM = { shouldScrollToBottom: false } as const;


interface ChannelMessagesProps {
    chats: ChatInfo[];
    chatId: string
    getOldMessages: () => void
    hasMoreOldMsg: boolean
    getNewMessages: () => void
    hasMoreNewMsg: boolean
    isNewMsgLoading: boolean
    isOLdMsgLoading: boolean
    clickedScrollToBottom: () => void;

}

export const ChatMessages = ({ chats, clickedScrollToBottom, chatId,  hasMoreNewMsg, getNewMessages, hasMoreOldMsg, getOldMessages, isNewMsgLoading, isOLdMsgLoading }: ChannelMessagesProps) => {
    const { isMobile } = useMedia();


    const [virtualShift, setVirtualShift] = useState(false);
    const pendingReactionDeletes = useRef<Set<string>>(new Set())

    const post = usePost()

    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    // Use a memoized selector with custom equality to prevent unnecessary re-renders
    const channelScrollToBottom = useSelector(
        (state: RootState) => state.chat.chatScrollToBottom[chatId],
        // Custom equality function to prevent re-renders on object reference changes
        (prev, next) => {
            // If both are undefined, they're equal
            if (!prev && !next) return true;
            
            // If one is undefined and the other isn't, they're different
            if (!prev || !next) return false;
            
            // Compare the actual property that matters for rendering
            return prev.shouldScrollToBottom === next.shouldScrollToBottom;
        }
    );
    
    // Memoize the fallback to ensure stable reference when channelScrollToBottom is undefined
    const safeChannelScrollToBottom = useMemo(() => 
        channelScrollToBottom || EMPTY_SCROLL_TO_BOTTOM,
        [channelScrollToBottom]
    );

    useEffect(() => {
        const uniqueUsers = new Set(chats.map((chat) => chat.chat_from?.user_uuid).filter(Boolean))
        uniqueUsers.forEach((userUUID) => {
            const userChat = chats.find((c) => c.chat_from?.user_uuid === userUUID)
            if (userChat?.chat_from && userChat?.chat_from.user_uuid != selfProfile.data?.data.user_uuid) {
                dispatch(
                    updateUserInfoStatus({
                        userUUID: userChat?.chat_from.user_uuid || "",
                        profileKey: userChat?.chat_from.user_profile_object_key || "",
                        userName: userChat?.chat_from.user_name || "",
                        status: userChat?.chat_from.user_status || "",
                    }),
                )
            }
        })
    }, [chats, dispatch])

    const createOrUpdateReaction = (messageId: string, emojiId:string, reactionId:string)=> {
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

            dispatch(updateChatReactionByChatId({chatId, reactionId, emojiId, messageId}))
        } else if (selfProfile.data?.data) {
             // Optimistic Create
            tempId = `temp-${Date.now()}`
            dispatch(createChatReactionChatId({
                chatId,
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
            }})
            .then((res)=>{
                if(reactionId) {
                   // Success
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                     // Create success: Swap temp ID with real ID
                    const realId = res.reaction_dgraph_id
                    dispatch(updateChatReactionId({
                        chatId,
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
                        dispatch(updateChatReactionByChatId({chatId, reactionId, emojiId: oldEmojiId, messageId}))
                    }
                } else {
                    dispatch(removeChatReactionByChatId({ chatId, messageId, reactionId: tempId}))
                }
            })
    }

    const removeReaction = (messageId: string, reactionId:string) => {
         // Handle Race Condition
        if (reactionId.startsWith("temp-")) {
            pendingReactionDeletes.current.add(reactionId)
            dispatch(removeChatReactionByChatId({ chatId, messageId, reactionId}))
            return
        }

        // Store reaction data to revert
        const reactionToRemove = chats
            .find((c) => c.chat_uuid === messageId)
            ?.chat_reactions?.find((r) => r.uid === reactionId)

        dispatch(removeChatReactionByChatId({ chatId, messageId, reactionId}))

        post.makeRequest<CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.RemoveChatReaction,
            payload :{
                chat_id: messageId,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{
               // Success
            })
            .catch(() => {
                // Revert
                 if (reactionToRemove) {
                    dispatch(createChatReactionChatId({
                        chatId,
                        messageId,
                        reactionId,
                        emojiId: reactionToRemove.reaction_emoji_id,
                        addedBy: reactionToRemove.reaction_added_by
                    }))
                }
            })
    }

    const executeDeleteChat = (messageId: string) => {
        // Store for revert
        const messageToDelete = chats.find(c => c.chat_uuid === messageId);
        
        // Optimistic Delete
        dispatch(removeChatByChatId({chatId, messageId}))

        // Sync sidebar preview immediately
        const selfUuid = selfProfile.data?.data?.user_uuid || ''
        if (selfUuid) {
            dispatch(RemoveMessageFromChatList({
                grpId: getGroupingId(chatId, selfUuid),
                messageId,
                chatKey: chatId,
            }))
        }

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChatMessage,
            payload: {
               chat_id: messageId
            },
            showToast: false,
            showErrorToast: true,
            description: "Deleting message"
        })
            .then((res) => {
                if (!res) {
                    // Revert if silent failure (payload empty)
                    if (messageToDelete) {
                        // We would need an 'addChatToId' or similar to revert. 
                        // For now we assume success or handle catch.
                    }
                }
            })
            .catch(() => {
                // Revert 
                // Note: Reverting a delete requires the full message object, 
                // which might require a specific redux action like 'addBackChat'.
                // If not present, we can just notify.
                // toast is now handled by usePost showErrorToast: true
            })

    }

    const handleUpdateChat = (postHTMLText: string, messageId: string) => {
        // Store for revert
        const originalMessage = chats.find(c => c.chat_uuid === messageId);
        const originalText = originalMessage?.chat_body_text || "";

        // Optimistic Update
        dispatch(updateChatByChatId({
            chatId: chatId,
            messageId,
            htmlText: postHTMLText,
        }))

        // Sync sidebar preview immediately
        const selfUuid = selfProfile.data?.data?.user_uuid || ''
        if (selfUuid) {
            dispatch(UpdateMessageTextInChatList({
                grpId: getGroupingId(chatId, selfUuid),
                messageId,
                htmlText: postHTMLText,
            }))
        }

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.UpdateChatMessage,
            payload: {
                chat_id: messageId,
                text_html: postHTMLText
            },
            showToast: false, // We handle it ourselves now for cleaner UX
            showErrorToast: true,
            description: "Updating message"
        })
            .then((res)=>{
                if(!res) {
                    // Revert
                    dispatch(updateChatByChatId({ chatId, messageId, htmlText: originalText }));
                }
            })
            .catch(() => {
                // Revert
                dispatch(updateChatByChatId({ chatId, messageId, htmlText: originalText }));
            })
        
    }


    const handleDeleteChat = (messageId: string) => {

        if(!messageId) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting chat message",
                    description: "Are you sure you want to proceed deleting the message",
                    confirmText: "Delete chat",
                    onConfirm: ()=>{executeDeleteChat(messageId)}
                }
            }));
        }, 500);

    }

    const groupedChats = useMemo(() => {
        try {
            return groupByDate(chats, (chat) => chat.chat_created_at);
        } catch (error) {
            console.error("Error grouping chats:", error);
            return {};
        }
    }, [chats]);

    const flatItems = useMemo(() => {
        const items: Array<FlatItem<ChatInfo>> = [];
        Object.keys(groupedChats).forEach((date) => {
            items.push({ type: "separator", date, key:  "separator"+date});
            groupedChats[date].forEach((chat) => items.push({ type: "item", data: chat, key: chat.chat_uuid}));
        });
        return items;
    }, [groupedChats]);

    const renderItem = useCallback((chat: ChatInfo, index: number, total: number) => {
        const isPriority = index >= total - 5;
        return (
        <div >
            {isMobile ?
                <TouchableDiv
                    rippleBrightness={0.8}
                    rippleDuration={800}

                >
                    <ChatMessageMobile
                        chatInfo={chat}
                        removeChat={()=>{handleDeleteChat(chat.chat_uuid)}}
                        addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                        removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                        updateChat={(body: string)=>{handleUpdateChat(body, chat.chat_uuid)}}
                        priority={isPriority}

                    />
                </TouchableDiv>
                :
                <ChatMessage
                    chatInfo={chat}
                    addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                    removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                    removePost={()=>{handleDeleteChat(chat.chat_uuid)}}
                    updatePost={(body: string)=>{handleUpdateChat(body, chat.chat_uuid)}}
                    priority={isPriority}
                />
            }
        </div>
    )}, [isMobile, selfProfile.data?.data, chatId]);

    const containerRef = useRef<VListHandle>(null);

    useEffect(()=>{
        if(safeChannelScrollToBottom.shouldScrollToBottom && containerRef.current) {
            dispatch(updateChatScrollToBottom({chatId, scrollToBottom: false}))
            containerRef.current.scrollToIndex(flatItems.length - 1, {
                smooth: true,
                align: "end",
                offset: 50
            },);
        }

    },[safeChannelScrollToBottom.shouldScrollToBottom])

    const handleGetOldMessage = () => {
        setVirtualShift(true)
        getOldMessages()
        setTimeout(() => {
            setVirtualShift(false)
        }, 1000)
    }

    const handleGetNewMessage = () => {
        getNewMessages()
    }


    const scrollPosition = useSelector((state: RootState) => state.chat.chatScrollPositions[chatId])

    const initialIndex = useMemo(() => {
        if (!scrollPosition?.key) {
            return undefined
        }
        const index = flatItems.findIndex((item) => item.key === scrollPosition.key)
        return index !== -1 ? index : undefined
    }, [flatItems, scrollPosition])

    const handleScroll = useCallback((key: string, offset: number) => {
        dispatch(updateChatScrollPosition({chatId, key, offset}))
    }, [chatId, dispatch])

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
        fetchOlderMessage={handleGetOldMessage}
        fetchNewMessage={handleGetNewMessage}
        hasNewMessage={hasMoreNewMsg}
        hasOldMessage={hasMoreOldMsg}
        olderMessageLoading={isOLdMsgLoading}
        newMessageLoading={isNewMsgLoading}
        ref={containerRef}
        virtualShift={virtualShift}
        clickedScrollToBottom={clickedScrollToBottom}
        initialTopMostItemIndex={initialIndex}
        initialScrollOffsetFromTop={scrollPosition?.offset}
        onScroll={debouncedHandleScroll}
        />
    );
};

ChatMessages.displayName = "ChatMessages";