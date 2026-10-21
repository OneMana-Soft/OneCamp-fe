"use client";


import {useParams} from "next/navigation";
import {useDispatch, useSelector} from "react-redux";
import {useFetch} from "@/hooks/useFetch";
import { ChatGet } from "@/services/endpoints/chat";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {CreateChatPaginationResRaw} from "@/types/chat";
import {updateGroupChats} from "@/store/slice/groupChatSlice";
import {MobileGroupChat} from "@/components/mobileChatMessage/mobileGroupChat";
import {MobileGroupChatMessageTextInput} from "@/components/textInput/mobileGroupChatMessageTextInput";


export default function Page() {

    const params = useParams()
    const grpId = params?.["chat-grp-id"] as string
    const chatMessageId = params?.["message-id"] as string

    const dispatch = useDispatch();

    const getNewPostsWithCurrentPost = useFetch<CreateChatPaginationResRaw>(grpId && chatMessageId ? ChatGet.GetNewGroupChatIncludingCurrentChat + '/' + grpId + '/' + chatMessageId: '')

    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || []);

    const chatState = chatMessageState?.find(c => c.chat_uuid === chatMessageId);


    useEffect(() => {

        if(getNewPostsWithCurrentPost.data?.data.chats && !chatState) {
            const newChats = [...(getNewPostsWithCurrentPost.data?.data?.chats ?? [])].reverse();
            dispatch(updateGroupChats({grpId, chats: newChats}))

        }

    }, [getNewPostsWithCurrentPost.data?.data]);

    if(!grpId || !chatMessageId) return


    return (
        <div className='flex flex-col h-full'>
            <MobileGroupChat grpId={grpId} chatMessageUUID={chatMessageId} />
            <div>
                <MobileGroupChatMessageTextInput grpId={grpId} chatMessageUUID={chatMessageId}/>
            </div>

        </div>
    )
}
