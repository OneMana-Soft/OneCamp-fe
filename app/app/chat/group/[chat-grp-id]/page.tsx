"use client";


import { useMedia } from "@/context/MediaQueryContext";
import {useParams} from "next/navigation";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {usePost} from "@/hooks/usePost";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {ChatInfo, CreateChatMessagePaginationResRaw, CreateChatRes, CreateOrUpdateChatsReq} from "@/types/chat";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {ChatGrpIdDesktop} from "@/components/groupChat/chatGrpIdDesktop";
import {GrpChatIdMobile} from "@/components/groupChat/grpChatIdMobile";
import {
    clearGroupChatInputState,
    createGroupChat,
    LocallyCreatedGrpInfoInterface,
    updateGroupChatScrollToBottom,
    ChatInputState, UpdateGrpChatLocally
} from "@/store/slice/groupChatSlice";
import {UpdateMessageInChatList, UpdateUnreadCountToZero} from "@/store/slice/chatSlice";
import {useEffect, useRef} from "react";


const EMPTY_CHATS: ChatInfo[] = []
const EMPTY_INPUT_STATE: ChatInputState = { chatBody: '', filesUploaded: [], filesPreview: [] }
const EMPTY_GRP_INFO: LocallyCreatedGrpInfoInterface = {} as LocallyCreatedGrpInfoInterface

export default function Page() {


    const params = useParams()
    const grpId = params?.['chat-grp-id'] as string

    const post = usePost()

    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || EMPTY_CHATS);

    const chatState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_INPUT_STATE);

    const grpChatCreatedLocally = useSelector((state: RootState) => state.groupChat.locallyCreatedGrpInfo[grpId] || EMPTY_GRP_INFO);

    const dispatch = useDispatch();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)


    const latestMsg = useFetch<CreateChatMessagePaginationResRaw>( grpChatCreatedLocally.grpId && !grpChatCreatedLocally?.haveSentFirstChat ?  '' : (grpId ? GetEndpointUrl.GetGroupChatLatestMessage + '/' + grpId : ''))


    const handleSend = () => {

        const body = removeEmptyPTags(chatState.chatBody)

        if(body.length==0) return

        const payloadForReq: CreateOrUpdateChatsReq = {
            media_attachments: chatState.filesUploaded,
            text_html: body,
            grp_id: grpId
        }

        const isLocallyCreated = grpChatCreatedLocally && grpChatCreatedLocally.grpId && !grpChatCreatedLocally.haveSentFirstChat

        if(isLocallyCreated) {
            payloadForReq.participants = grpChatCreatedLocally.participants.map((t) => t.uid || '')
            payloadForReq.grp_id = ''
        }


        post.makeRequest<CreateOrUpdateChatsReq, CreateChatRes>({
            apiEndpoint: PostEndpointUrl.CreateGroupChatMessage,
            payload: payloadForReq
        })
            .then((res)=>{


                if (
                    res &&
                    ((latestMsg.data?.data &&
                    latestMsg.data?.data?.chats?.[0]?.chat_uuid ==
                    chatMessageState[chatMessageState.length - 1]?.chat_uuid) || isLocallyCreated)
                ) {

                    console.log("adding CHAT")
                    dispatch(createGroupChat({
                        grpId: grpId,
                        chatCreatedAt:res?.chat_created_at,
                        chatBy: selfProfile.data?.data || {} as UserProfileDataInterface,
                        chatText: body,
                        attachments: chatState.filesUploaded,
                        chatId: res?.uuid,
                    }))

                    dispatch(UpdateMessageInChatList({
                        name: selfProfile.data?.data.user_name || '',
                        msgTime: res?.chat_created_at,
                        attachments: chatState.filesUploaded,
                        msg: body,
                        chatUuid: res?.uuid || '',
                        grpId: grpId
                    }))

                    latestMsg.mutate()

                    if(isLocallyCreated) {
                        dispatch(UpdateGrpChatLocally({grpId}))
                    }

                    dispatch(updateGroupChatScrollToBottom({grpId, scrollToBottom: true}))


                }

            })
        dispatch(clearGroupChatInputState({grpId}))
    }


    const userChats = useSelector((state: RootState) => state.users.userSidebar.userChats);
    const chatInSidebar = userChats.find(chat => chat.dm_grouping_id === grpId);
    const unreadCountRef = useRef(chatInSidebar?.dm_unread || 0);

    useEffect(()=>{
        dispatch(UpdateUnreadCountToZero({grpId}))
    },[])


    const { isMobile, isDesktop } = useMedia();

    if(!grpId) return

    return (
        <>

            {isMobile && <GrpChatIdMobile grpId={grpId} handleSend={handleSend} unreadCount={unreadCountRef.current} />}

            {isDesktop && <ChatGrpIdDesktop grpId={grpId} handleSend={handleSend} unreadCount={unreadCountRef.current} />}
        </>
    );
}
