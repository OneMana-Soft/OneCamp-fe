"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import { useLeaveLink, useLinkSearchParams, useLinkedPage } from "@/hooks/useLinkTarget";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {  PostsRes} from "@/types/post";
import {memo, useEffect, useState} from "react";

import {CreateChatPaginationResRaw} from "@/types/chat";
import {ChatInfo} from "@/types/chat";
import {useMessageResync} from "@/hooks/useMessageResync";
import {GroupChatTypingBar} from "@/components/typingIndicator/typingIndicatorBar";
import {RawUserDMInterface} from "@/types/user";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import { ConversationLoadError } from "@/components/message/conversationError";
import {
    updateGroupChats,
    updateGroupChatScrollToBottom,
    mergeGroupChats
} from "@/store/slice/groupChatSlice";
import {GroupChatMessages} from "@/components/groupChat/groupChatMessages";
import {useSearchParams} from "next/navigation";
import { dataToSeed } from "@/lib/swrMutate";
import { pageEdgeQuery } from "@/lib/chat/pageEdge";
import { useOlderPages } from "@/hooks/useOlderPages";

interface ChatMessageListProps {
    grpId: string;
    messageId?: string;
    /** Unread when the group was opened: where the "New" line goes. */
    unreadOnOpen?: number;
}

const EMPTY_CHATS: PostsRes[] = []

// Memoised: its props are ids, so a parent re-rendering for another reason
// (the composer's draft changes on every keystroke) never re-renders every
// message. On a phone that re-render cost up to 300 ms a key.
export const GroupChatMessageList = memo(function GroupChatMessageList({grpId, messageId: propMessageId, unreadOnOpen}: ChatMessageListProps) {

    const searchParams = useLinkSearchParams(useSearchParams());
    const messageId = propMessageId || searchParams?.get('messageId') || undefined;

    const dmParticipantsInfo  = useFetchOnlyOnce<RawUserDMInterface>(`${GetEndpointUrl.GetDmGroupParticipants}/${grpId}`)

    const latestKey = messageId || (!dmParticipantsInfo.data?.data) ? '' : GetEndpointUrl.GetGroupChatLatestMessage + '/' + grpId
    const latestMsg = useFetch<CreateChatPaginationResRaw>(latestKey)
    const getNewChatsWithCurrentChat = useFetch<CreateChatPaginationResRaw>(messageId ? GetEndpointUrl.GetNewGroupChatIncludingCurrentChat + '/' + grpId + '/' + messageId: '')

    // Revalidate the latest window on open/switch so a revisited group picks
    // up messages that arrived while away. The merge effect reconciles without
    // clobbering optimistic sends.
    useEffect(() => {
        if (!messageId && grpId && dmParticipantsInfo.data?.data) {
            void latestMsg.mutate()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [grpId, messageId, dmParticipantsInfo.data?.data])

    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || EMPTY_CHATS);


    const [hasMoreChat, setHasMoreChat] = useState(true)
    const [oldChatTime, setOldChatTime] = useState(0)
    // The message the older page starts next to (lib/chat/pageEdge).
    const [oldEdge, setOldEdge] = useState('')
    const oldMsg = useFetch<CreateChatPaginationResRaw>(oldChatTime == 0 || !dmParticipantsInfo.data?.data ? '' : GetEndpointUrl.GetOldGroupChatBefore + '/' + grpId + '/' + oldChatTime + oldEdge)

    const [hasMoreNewChat, setHasMoreNewChat] = useState(!!messageId)
    const [newChat, setNewChat] = useState(0)
    const [newEdge, setNewEdge] = useState('')
    const newMsg = useFetch<CreateChatPaginationResRaw>(newChat == 0 || !dmParticipantsInfo.data?.data ? '' : GetEndpointUrl.GetNewGroupChatAfter + '/' + grpId + '/' + newChat + newEdge)

    const dispatch = useDispatch();


    useEffect(() => {

        if(messageId && getNewChatsWithCurrentChat.data?.data?.chats?.length && chatMessageState.length == 0 ) {
            const newChats = getNewChatsWithCurrentChat.data?.data?.chats ?? [];

            dispatch(updateGroupChats({chats:newChats, grpId}))
        }

        // Non-empty only: an empty answer stored a new [] that re-ran this effect.
        if(!messageId && latestMsg.data?.data.chats?.length && chatMessageState.length == 0 ) {
            // An empty list has nothing to lose: seeded, and the answer noted.
            dataToSeed(latestKey, latestMsg.data)
            // Copy before reversing: latestMsg.data is the live SWR cache.
            const newChats = [...latestMsg.data.data.chats].reverse();

            dispatch(updateGroupChats({grpId, chats: newChats}))
        } else if (!messageId && chatMessageState.length > 0) {
            // Already-loaded group revisited: merge the fresh latest window so
            // a message that arrived while away appears without a hard refresh.
            // Each answer once (lib/swrMutate dataToSeed): merging the same
            // cached answer on every change put back live edits and reactions.
            const answer = dataToSeed(latestKey, latestMsg.data)
            if (answer?.data.chats) {
                const latest = [...answer.data.chats].reverse();
                dispatch(mergeGroupChats({
                    grpId,
                    chats: latest,
                    authoritativeThrough: latestMsg.lastRequestStartedAt,
                }))
            }
        }

    }, [getNewChatsWithCurrentChat, latestMsg, latestKey, chatMessageState, messageId, grpId, dispatch]);

    useEffect(() => {

        if(chatMessageState && oldMsg.data?.data && oldChatTime != 0) {
            setHasMoreChat(oldMsg.data.data.has_more)
            setOldChatTime(0)
            if(oldMsg.data?.data.chats && oldMsg.data?.data.chats.length !== 0) {
                const existingUuids = new Set(chatMessageState.map(c => c.chat_uuid))
                // Copy before reversing — don't mutate the live SWR cache.
                const dedupedOld = [...oldMsg.data.data.chats].reverse().filter(c => !existingUuids.has(c.chat_uuid))
                const chats = dedupedOld.concat(chatMessageState)

                dispatch(updateGroupChats({chats, grpId}))
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


    const retryOlder = useOlderPages({
        latestHasMore: latestMsg.data?.data?.has_more,
        setHasMore: setHasMoreChat,
        asking: oldChatTime != 0,
        older: oldMsg,
    })

    const leaveLink = useLeaveLink('messageId')
    const handleClickedScrollToBottom = () => {
        // In link mode the latest page isn't loaded: leave the link, and it is (FE-BUG-9).
        if (leaveLink()) return

        if(chatMessageState.length > 0 && chatMessageState[chatMessageState.length -1].chat_uuid != latestMsg.data?.data.chats?.[0]?.chat_uuid) {
            // Copy before reversing — don't mutate the live SWR cache.
            const newChats = latestMsg.data?.data.chats ? [...latestMsg.data.data.chats].reverse() : [];

            dispatch(updateGroupChats({grpId, chats: newChats}))
        }

        dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: true}))

    }

    const getOldMessages = () => {
        if (chatMessageState.length === 0) return
        const lastTimeString = chatMessageState[0].chat_created_at
        const epochTime = Math.floor(Date.parse(lastTimeString) / 1000);
        setOldEdge(pageEdgeQuery(lastTimeString, chatMessageState[0].chat_uuid))
        setOldChatTime(epochTime)
    }

    const getNewMessages = () => {
        if (chatMessageState.length === 0) return
        const lastTimeString = chatMessageState[chatMessageState.length -1].chat_created_at
        const epochTime = Math.ceil(Date.parse(lastTimeString) / 1000);
        setNewEdge(pageEdgeQuery(lastTimeString, chatMessageState[chatMessageState.length -1].chat_uuid))
        setNewChat(epochTime)
        setHasMoreNewChat(false)
    }

    // Reconcile against the server when MQTT recovers from a long gap
    // (idle tab). Window-reconcile (adds/edits/deletes within the latest
    // window); disabled in permalink mode.
    useMessageResync<ChatInfo>({
        enabled: !messageId && !!dmParticipantsInfo.data?.data,
        latestUrl: messageId || !dmParticipantsInfo.data?.data ? '' : GetEndpointUrl.GetGroupChatLatestMessage + '/' + grpId,
        extract: (payload) => {
            const chats = payload?.data?.chats as ChatInfo[] | undefined
            return chats ? [...chats].reverse() : undefined
        },
        onMerge: (chats, authority) => dispatch(mergeGroupChats({ grpId, chats, ...authority })),
    })

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {

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


    useLinkedPage('group', grpId, messageId, chatMessageState, getNewChatsWithCurrentChat.data?.data?.chats, setHasMoreNewChat)

    if (latestMsg.isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <ChatLoadingSkeleton />
            </div>
        )
    }

    // Failed, with nothing to show: say so, never "This is the start of your
    // group". A group asks who is in it before its messages, so either answer
    // failing is the conversation failing to load. Opened at a message, the
    // page around it is the messages' read.
    const peopleFailed = !!dmParticipantsInfo.isError && !dmParticipantsInfo.data
    const opening = messageId ? getNewChatsWithCurrentChat : latestMsg
    if (chatMessageState.length === 0 && (peopleFailed || (opening.isError && !opening.data))) {
        return <ConversationLoadError subject="this conversation" retry={() => (peopleFailed ? dmParticipantsInfo.mutate() : opening.mutate())} />
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
                unreadOnOpen={unreadOnOpen}
                retryOlder={retryOlder}
            />
            <GroupChatTypingBar grpId={grpId} />
        </div>
    )

})