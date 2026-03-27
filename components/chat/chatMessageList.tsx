"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {  PostsRes} from "@/types/post";
import {useEffect, useMemo, useState} from "react";

import {ChatMessages} from "@/components/chat/chatMessages";
import {ChatInfo, CreateChatPaginationResRaw} from "@/types/chat";
import {updateChats, updateChatScrollToBottom} from "@/store/slice/chatSlice";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {updateChannelPosts, updateChannelScrollToBottom} from "@/store/slice/channelSlice";
import {UserProfileInterface} from "@/types/user";
import {LoaderCircle} from "lucide-react";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import {useSearchParams} from "next/navigation";

// Stable empty array reference to prevent unnecessary re-renders
const EMPTY_CHAT_MESSAGES: ChatInfo[] = [];

interface ChatMessageListProps {
    chatId: string;
    messageId?: string;
}

export const ChatMessageList = ({chatId,  messageId: propMessageId}: ChatMessageListProps) => {

    const searchParams = useSearchParams();
    const messageId = propMessageId || searchParams?.get('messageId') || undefined;

    const latestMsg = useFetch<CreateChatPaginationResRaw>(messageId ? '' : GetEndpointUrl.GetChatLatestMessage + '/' + chatId)
    const getNewChatsWithCurrentChat = useFetch<CreateChatPaginationResRaw>(messageId ? GetEndpointUrl.GetNewChatIncludingCurrentChat + '/' + chatId + '/' + messageId: '')

    // Use a memoized selector with custom equality to prevent unnecessary re-renders
    const rawChatTypingState = useSelector(
        (state: RootState) => state.typing.chatTyping[chatId],
        // Custom equality function to prevent re-renders when array reference changes but content is the same
        (prev, next) => {
            // If both are undefined, they're equal
            if (!prev && !next) return true;
            
            // If one is undefined and the other isn't, they're different
            if (!prev || !next) return false;
            
            // If lengths differ, they're different
            if (prev.length !== next.length) return false;
            
            // Compare user IDs to check if the typing users are the same
            return prev.every((item, index) => 
                item.userId === next[index]?.userId
            );
        }
    );
    
    // Memoize the mapped result to prevent creating a new array on every render
    const chatTypingState = useMemo(() => 
        (rawChatTypingState || []).map(item => item.user),
        [rawChatTypingState]
    );

    // Use a memoized selector with custom equality to prevent unnecessary re-renders
    const chatMessageState = useSelector(
        (state: RootState) => state.chat.chatMessages[chatId]
    );
    
    // Memoize the fallback to ensure stable reference when chatMessageState is undefined
    const safeChatMessageState = useMemo(() => 
        chatMessageState || EMPTY_CHAT_MESSAGES,
        [chatMessageState]
    );

    const [hasMoreChat, setHasMoreChat] = useState(true)
    const [oldChatTime, setOldChatTime] = useState(0)
    const oldMsg = useFetch<CreateChatPaginationResRaw>(oldChatTime == 0 ? '' : GetEndpointUrl.GetOldChatBefore + '/' + chatId + '/' + oldChatTime)

    const [hasMoreNewChat, setHasMoreNewChat] = useState(!!messageId)
    const [newChat, setNewChat] = useState(0)
    const newMsg = useFetch<CreateChatPaginationResRaw>(newChat == 0 ? '' : GetEndpointUrl.GetNewChatAfter + '/' + chatId + '/' + newChat)



    const dispatch = useDispatch();


    useEffect(() => {

        if(messageId && getNewChatsWithCurrentChat.data?.data?.chats && safeChatMessageState.length == 0) {
            const newChats = getNewChatsWithCurrentChat.data?.data?.chats ?? [];
            dispatch(updateChats({chats:newChats, chatId}))
        }

        if(!messageId && latestMsg.data?.data.chats && safeChatMessageState.length == 0 ) {
            const newChats = latestMsg.data?.data.chats.reverse() ?? [];
            dispatch(updateChats({chatId, chats: newChats}))
            latestMsg.data?.data.chats.reverse()
            setHasMoreNewChat(false)
        }

    }, [getNewChatsWithCurrentChat, latestMsg]);

    useEffect(() => {

        if(safeChatMessageState && oldMsg.data?.data && oldChatTime != 0) {
            setHasMoreChat(oldMsg.data.data.has_more)
            setOldChatTime(0)
            if(oldMsg.data?.data.chats && oldMsg.data?.data.chats.length !== 0) {
                const existingUuids = new Set(safeChatMessageState.map(c => c.chat_uuid))
                const dedupedOld = oldMsg.data.data.chats.reverse().filter(c => !existingUuids.has(c.chat_uuid))
                const chats = dedupedOld.concat(safeChatMessageState)
                dispatch(updateChats({chats, chatId}))
                oldMsg.data.data.chats.reverse()
            }
        }

    }, [ oldMsg.data?.data, safeChatMessageState]);

    useEffect(() => {

        if(safeChatMessageState && newMsg.data?.data && newChat != 0) {
            setHasMoreNewChat(newMsg.data.data.has_more)
            setNewChat(0)
            if(newMsg.data?.data.chats && newMsg.data?.data.chats.length !== 0) {
                const existingUuids = new Set(safeChatMessageState.map(c => c.chat_uuid))
                const dedupedNew = newMsg.data.data.chats.filter((c: ChatInfo) => !existingUuids.has(c.chat_uuid))
                const chats = safeChatMessageState.concat(dedupedNew)
                dispatch(updateChats({chats, chatId}))
            }
        }

    }, [ newMsg.data?.data, safeChatMessageState]);


    const handleClickedScrollToBottom = () => {

        if(safeChatMessageState.length > 0 && safeChatMessageState[safeChatMessageState.length -1].chat_uuid != latestMsg.data?.data.chats?.[0]?.chat_uuid) {
            const newChats = latestMsg.data?.data.chats.reverse() ?? [];
            dispatch(updateChats({chatId, chats: newChats}))
            latestMsg.data?.data.chats.reverse()
        }

        dispatch(updateChatScrollToBottom({chatId: chatId, scrollToBottom: true}))

    }

    const getOldMessages = () => {

        if(safeChatMessageState.length === 0) return;
        const lastTimeString = safeChatMessageState[0].chat_created_at
        const epochTime = Math.floor(Date.parse(lastTimeString) / 1000);
        setOldChatTime(epochTime)
        setHasMoreChat(false)
    }

    const getNewMessages = () => {
        if(safeChatMessageState.length === 0) return;
        const lastTimeString = safeChatMessageState[safeChatMessageState.length -1].chat_created_at
        const epochTime = Math.ceil(Date.parse(lastTimeString) / 1000);
        setNewChat(epochTime)
        setHasMoreNewChat(false)
    }

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                // console.log("[Sync] Tab visible, fetching new chat messages...");
                getNewMessages();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleVisibilityChange);
        };
    }, [safeChatMessageState]); // Re-bind if messages change to ensure correct epoch


    if (latestMsg.isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <ChatLoadingSkeleton />
            </div>
        )
    }

    return (
        <div className='flex flex-col h-full gap-y-2 '>
            <ChatMessages
                chats={safeChatMessageState}
                chatId={chatId}
                getNewMessages={getNewMessages}
                getOldMessages={getOldMessages}
                hasMoreNewMsg={hasMoreNewChat}
                hasMoreOldMsg={hasMoreChat}
                isNewMsgLoading={newMsg.isLoading}
                isOLdMsgLoading={oldMsg.isLoading}
                clickedScrollToBottom={handleClickedScrollToBottom}
            />
            <TypingIndicator users={chatTypingState}/>
        </div>
    )

}