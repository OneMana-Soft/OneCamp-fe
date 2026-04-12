// src/components/channel/ChannelMessages.tsx
import { useEffect, useMemo, useRef, useState, useCallback} from "react";
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
import {openUI} from "@/store/slice/uiSlice";
import {MessageListVirtua} from "@/components/message/MessaageListVirtua";
import {VListHandle} from "virtua";
import {RootState} from "@/store/store";
import {ChatInfo, CreateOrUpdateChatsReq} from "@/types/chat";
import {
    createGroupChatReactionChatId, removeGroupChatByChatId,
    removeGroupChatReactionByChatId, updateGroupChatByChatId,
    updateGroupChatReactionByChatId, updateGroupChatScrollToBottom, updateGroupChatReactionId
} from "@/store/slice/groupChatSlice";
import {updateChatScrollPosition, RemoveMessageFromChatList, UpdateMessageTextInChatList} from "@/store/slice/chatSlice";
import {GroupChatMessage} from "@/components/groupChat/groupChatMessage";
import {ScrollToBottom} from "@/store/slice/channelSlice";
import {GroupChatMessageMobile} from "@/components/groupChat/groupChatMessageMobile";


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

}

const EMPTY_SCROLL_TO_BOTTOM: ScrollToBottom = { shouldScrollToBottom: false }

export const GroupChatMessages = ({ chats, clickedScrollToBottom, grpId,  hasMoreNewMsg, getNewMessages, hasMoreOldMsg, getOldMessages, isNewMsgLoading, isOLdMsgLoading }: ChannelMessagesProps) => {
    const { isMobile } = useMedia();

    const [virtualShift, setVirtualShift] = useState(false);
    const pendingReactionDeletes = useRef<Set<string>>(new Set())

    const post = usePost()

    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const channelScrollToBottom = useSelector((state: RootState) => state.groupChat.chatScrollToBottom[grpId] || EMPTY_SCROLL_TO_BOTTOM);

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
            }})
            .then((res)=>{
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
    }

    const removeReaction = (messageId: string, reactionId:string) => {
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
            }})
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
    }

    const executeDeleteChat = (messageId: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChatMessage,
            payload: {
               chat_id: messageId
            },
            showToast: true
        })
            .then(() => {
                // Compute fallback before removal
                const remaining = chats.filter(m => m.chat_uuid !== messageId);
                const fallback = remaining.length > 0 ? remaining[remaining.length - 1] : null;

                dispatch(removeGroupChatByChatId({grpId, messageId}))
                // Sync sidebar preview
                dispatch(RemoveMessageFromChatList({
                    grpId: grpId,
                    messageId,
                    chatKey: grpId,
                    fallbackMessage: fallback,
                }))
            })

    }

    const handleUpdateChat = (postHTMLText: string, messageId: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.UpdateGroupChatMessage,
            payload: {
                chat_id: messageId,
                text_html: postHTMLText,
                grp_id: grpId
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateGroupChatByChatId({
                        grpId,
                        messageId,
                        htmlText: postHTMLText,
                    }))
                    // Sync sidebar preview
                    dispatch(UpdateMessageTextInChatList({
                        grpId: grpId,
                        messageId,
                        htmlText: postHTMLText,
                    }))
                }

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

    const renderItem = (chat: ChatInfo, index: number, total: number) => {
        const isPriority = index >= total - 5;
        return (
        <div >
            {isMobile ?
                <TouchableDiv
                    rippleBrightness={0.8}
                    rippleDuration={800}

                >
                    <GroupChatMessageMobile
                        chatInfo={chat}
                        removeChat={()=>{handleDeleteChat(chat.chat_uuid)}}
                        addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                        removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                        updateChat={(body: string)=>{handleUpdateChat(body, chat.chat_uuid)}}
                        priority={isPriority}
                        grpId={grpId}


                    />
                </TouchableDiv>
                :
                <GroupChatMessage
                    chatInfo={chat}
                    addReaction={(emojiId:string, reactionId:string)=>{createOrUpdateReaction(chat.chat_uuid, emojiId, reactionId)}}
                    removeReaction={(reactionId: string)=>{ removeReaction(chat.chat_uuid, reactionId)}}
                    removePost={()=>{handleDeleteChat(chat.chat_uuid)}}
                    updatePost={(body: string)=>{handleUpdateChat(body, chat.chat_uuid)}}
                    grpId={grpId}
                    priority={isPriority}
                />
            }
        </div>
    )};

    const containerRef = useRef<VListHandle>(null);

    useEffect(()=>{
        if(channelScrollToBottom.shouldScrollToBottom && containerRef.current) {
            dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: false}))
            containerRef.current.scrollToIndex(flatItems.length - 1, {
                smooth: true,
                align: "end",
                offset: 50
            },);
        }

    },[channelScrollToBottom.shouldScrollToBottom])

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


    const scrollPosition = useSelector((state: RootState) => state.chat.chatScrollPositions[grpId])

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

GroupChatMessages.displayName = "GroupChatMessages";