"use client";


import {useParams} from "next/navigation";
import {MobileChat} from "@/components/mobileChatMessage/mobileChat";
import {MobileChatMessageTextInput} from "@/components/textInput/mobileChatMessageTextInput";
import {useDispatch, useSelector} from "react-redux";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {CreateChatPaginationResRaw} from "@/types/chat";
import {updateChats} from "@/store/slice/chatSlice";


export default function Page() {

    const params = useParams()
    const chatId = params?.["chat-id"] as string
    const chatMessageId = params?.["message-id"] as string

    const dispatch = useDispatch();

    const getNewPostsWithCurrentPost = useFetch<CreateChatPaginationResRaw>(chatId ? GetEndpointUrl.GetNewChatIncludingCurrentChat + '/' + chatId + '/' + chatMessageId: '')

    const chatMessageState = useSelector((state: RootState) => state.chat.chatMessages[chatId] || []);

    const chatState = chatMessageState?.find(c => c.chat_uuid === chatMessageId);


    useEffect(() => {

        if(getNewPostsWithCurrentPost.data?.data.chats && !chatState) {
            const newChats = [...(getNewPostsWithCurrentPost.data?.data?.chats ?? [])].reverse();

            dispatch(updateChats({chatId, chats: newChats}))

        }

    }, [getNewPostsWithCurrentPost.data?.data]);

    if(!chatId || !chatMessageId) return

    return (
        <div className='flex flex-col h-full'>
            <MobileChat chatId={chatId} chatMessageUUID={chatMessageId} />
            <div>
                <MobileChatMessageTextInput chatId={chatId} chatMessageUUID={chatMessageId}/>
            </div>

        </div>
    )
}
