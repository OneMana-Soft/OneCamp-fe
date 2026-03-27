"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {  PostsRes} from "@/types/post";
import {useEffect, useState, useMemo} from "react";

import {ChatMessages} from "@/components/chat/chatMessages";
import {CreateChatPaginationResRaw} from "@/types/chat";
import {updateChats, updateChatScrollToBottom} from "@/store/slice/chatSlice";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {updateChannelPosts, updateChannelScrollToBottom} from "@/store/slice/channelSlice";
import {RawUserDMInterface, UserProfileInterface} from "@/types/user";
import {LoaderCircle} from "lucide-react";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import {
    LocallyCreatedGrpInfoInterface,
    updateGroupChats,
    updateGroupChatScrollToBottom
} from "@/store/slice/groupChatSlice";
import {GroupChatMessages} from "@/components/groupChat/groupChatMessages";
import {useSearchParams} from "next/navigation";

interface ChatMessageListProps {
    grpId: string;
    messageId?: string;
}

const EMPTY_CHATS: PostsRes[] = []

export const GroupChatMessageList = ({grpId, messageId: propMessageId}: ChatMessageListProps) => {

    const searchParams = useSearchParams();
    const messageId = propMessageId || searchParams?.get('messageId') || undefined;

    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)

    const latestMsg = useFetch<CreateChatPaginationResRaw>(messageId || (!dmParticipantsInfo.data?.data) ? '' : GetEndpointUrl.GetGroupChatLatestMessage + '/' + grpId)
    const getNewChatsWithCurrentChat = useFetch<CreateChatPaginationResRaw>(messageId ? GetEndpointUrl.GetNewGroupChatIncludingCurrentChat + '/' + grpId + '/' + messageId: '')

    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || EMPTY_CHATS);

    const rawChatTyping = useSelector((state: RootState) => state.typing.groupChatTyping[grpId] || []);
    const chatTypingState = useMemo(() => (rawChatTyping as any[]).map(item => item.user), [rawChatTyping]);

    const [hasMoreChat, setHasMoreChat] = useState(true)
    const [oldChatTime, setOldChatTime] = useState(0)
    const oldMsg = useFetch<CreateChatPaginationResRaw>(oldChatTime == 0 || !dmParticipantsInfo.data?.data ? '' : GetEndpointUrl.GetOldGroupChatBefore + '/' + grpId + '/' + oldChatTime)

    const [hasMoreNewChat, setHasMoreNewChat] = useState(!!messageId)
    const [newChat, setNewChat] = useState(0)
    const newMsg = useFetch<CreateChatPaginationResRaw>(newChat == 0 || !dmParticipantsInfo.data?.data ? '' : GetEndpointUrl.GetNewGroupChatAfter + '/' + grpId + '/' + newChat)

    const dispatch = useDispatch();


    useEffect(() => {

        if(messageId && getNewChatsWithCurrentChat.data?.data?.chats  && chatMessageState.length == 0 ) {
            const newChats = getNewChatsWithCurrentChat.data?.data?.chats ?? [];

            dispatch(updateGroupChats({chats:newChats, grpId}))
        }

        if(!messageId && latestMsg.data?.data.chats && chatMessageState.length == 0 ) {
            const newChats = latestMsg.data?.data.chats.reverse() ?? [];

            dispatch(updateGroupChats({grpId, chats: newChats}))
            latestMsg.data?.data.chats.reverse()
        }

    }, [getNewChatsWithCurrentChat, latestMsg]);

    useEffect(() => {

        if(chatMessageState && oldMsg.data?.data && oldChatTime != 0) {
            setHasMoreChat(oldMsg.data.data.has_more)
            setOldChatTime(0)
            if(oldMsg.data?.data.chats && oldMsg.data?.data.chats.length !== 0) {
                const existingUuids = new Set(chatMessageState.map(c => c.chat_uuid))
                const dedupedOld = oldMsg.data.data.chats.reverse().filter(c => !existingUuids.has(c.chat_uuid))
                const chats = dedupedOld.concat(chatMessageState)

                dispatch(updateGroupChats({chats, grpId}))
                oldMsg.data.data.chats.reverse()
            }
        }

    }, [ oldMsg.data?.data]);

    useEffect(() => {

        if(chatMessageState && newMsg.data?.data && newChat != 0) {
            setHasMoreNewChat(newMsg.data.data.has_more)
            setNewChat(0)
            if(newMsg.data?.data.chats && newMsg.data?.data.chats.length !== 0) {
                const existingUuids = new Set(chatMessageState.map(c => c.chat_uuid))
                const dedupedNew = newMsg.data.data.chats.filter(c => !existingUuids.has(c.chat_uuid))
                const chats = chatMessageState.concat(dedupedNew)

                dispatch(updateGroupChats({chats, grpId}))
            }
        }

    }, [ newMsg.data?.data]);


    const handleClickedScrollToBottom = () => {

        if(chatMessageState[chatMessageState.length -1].chat_uuid != latestMsg.data?.data.chats?.[0]?.chat_uuid) {
            const newChats = latestMsg.data?.data.chats.reverse() ?? [];

            dispatch(updateGroupChats({grpId, chats: newChats}))
            latestMsg.data?.data.chats.reverse()
        }

        dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: true}))

    }

    const getOldMessages = () => {

        const lastTimeString = chatMessageState[0].chat_created_at
        const epochTime = Math.floor(Date.parse(lastTimeString) / 1000);
        setOldChatTime(epochTime)
        setHasMoreChat(false)
    }

    const getNewMessages = () => {

        const lastTimeString = chatMessageState[chatMessageState.length -1].chat_created_at
        const epochTime = Math.ceil(Date.parse(lastTimeString) / 1000);
        setNewChat(epochTime)
        setHasMoreNewChat(false)
    }

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                // console.log("[Sync] Tab visible, fetching new group chat messages...");
                getNewMessages();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleVisibilityChange);
        };
    }, [chatMessageState]);


    if (latestMsg.isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <ChatLoadingSkeleton />
            </div>
        )
    }


    return (
        <div className='flex flex-col h-full gap-y-2 '>
            <GroupChatMessages
                chats={chatMessageState || []}
                getNewMessages={getNewMessages}
                getOldMessages={getOldMessages}
                hasMoreNewMsg={hasMoreNewChat}
                hasMoreOldMsg={hasMoreChat}
                isNewMsgLoading={newMsg.isLoading}
                isOLdMsgLoading={oldMsg.isLoading}
                clickedScrollToBottom={handleClickedScrollToBottom}
                grpId={grpId}
            />
            <TypingIndicator users={chatTypingState}/>
        </div>
    )

}