"use client";


import {useParams, useRouter} from "next/navigation";
import {useMedia} from "@/context/MediaQueryContext";
import {ChannelIdMobile} from "@/components/channel/channelIdMobile";
import {ChannelIdDesktop} from "@/components/channel/chanelIdDesktop";
import {useFetch} from "@/hooks/useFetch";
import {ChatInfoRes} from "@/types/chat";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {PostsResRaw} from "@/types/post";
import { ChannelAndUserListInterfaceResp, chat_forward_type, MessageFwdReq} from "@/types/user";
import {clearFwdMsgInputState, createOrUpdateFwdMsg} from "@/store/slice/fwdMessageSlice";
import {usePost} from "@/hooks/usePost";
import {useEffect, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {ForwardMessageDropdown} from "@/components/searchDropdown/fwdMsgToDropdown/fwdMsgToDropdown";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {cn} from "@/lib/utils/helpers/cn";
import {MessagePreview} from "@/components/message/MessagePreview";
import * as React from "react";
import {LoaderCircle} from "lucide-react";

export default function Page() {


    const params = useParams()
    const fwdType = params?.["forward-type"] as string
    const fwdId = params?.["forward-id"] as string

    const chatUUID = fwdType == chat_forward_type ? fwdId: undefined
    const channelUUID = fwdType != chat_forward_type ? fwdType: undefined
    const postUUID = fwdType != chat_forward_type ? fwdId: undefined


    const { makeRequest, isSubmitting } = usePost();

    const router = useRouter();


    const chatInfo = useFetch<ChatInfoRes>(chatUUID ? `${GetEndpointUrl.GetOnlyChatText}/${chatUUID}`: "")
    const postInfo = useFetch<PostsResRaw>(channelUUID ? `${GetEndpointUrl.GetOnlyPostText}/${channelUUID}/${postUUID}` : "")


    const [selectedUsersOrChannels, setSelectedUsersOrChannels] = useState<ChannelAndUserListInterfaceResp[]>([])


    const fwdMsgInputState = useSelector((state: RootState) => state.fwdMsg.fwdMsgInputInputState);

    const fwdMsgInputStateClick = useSelector((state: RootState) => state.fwdMsg.fwdMsgInputInputState.mobileViewSendClicked);


    const selectChatsOrChannels = (input:ChannelAndUserListInterfaceResp[]) => {
        setSelectedUsersOrChannels(input);
    }

    const dispatch = useDispatch();

    const clickFwdMessage = () => {
        makeRequest<MessageFwdReq, any>({
            apiEndpoint: PostEndpointUrl.FwdMsgToChatOrChannel,
            payload: {
                fwd_list: selectedUsersOrChannels,
                fwd_attachments: fwdMsgInputState.filesUploaded,
                fwd_channel_uuid: channelUUID||'',
                fwd_post_uuid: postUUID||'',
                fwd_chat_uuid: chatUUID||'',
                fwd_text: fwdMsgInputState.fwdMsgBody
            },
            showToast: true
        }).then(()=>{
            dispatch(clearFwdMsgInputState())
            router.back()
        }).catch((err) => {
            console.error('Forward message failed:', err)
        })

    }


    useEffect(()=>{

        if(fwdMsgInputStateClick) {
            clickFwdMessage()
        }

    }, [fwdMsgInputStateClick])


    if (isSubmitting || postInfo.isLoading || chatInfo.isLoading) {
        return (
            <div className='h-full w-full flex items-center justify-center'>
                <LoaderCircle className="mr-2 h-12 w-12 animate-spin"/>

            </div>
        )
    }


    return (
        <div className='flex-col space-y-4 mt-4'>
            <ForwardMessageDropdown onSelect={selectChatsOrChannels}/>
            <MinimalTiptapTextInput
                throttleDelay={300}

                className={cn("max-w-full rounded-xl h-auto border bg-secondary/20 mb-2")}
                editorContentClassName="overflow-auto"
                output="html"
                placeholder={"Add a message, if you'd like..."}
                editable={true}
                editorClassName="focus:outline-none px-2 py-2"
                onChange={(content ) => {
                    const t = content as string
                    dispatch(createOrUpdateFwdMsg({body: t}))

                }}
            >

            </MinimalTiptapTextInput>
            <div className='p-4'>
            <MessagePreview
                msgBy={postInfo.data?.data?.post_by || chatInfo.data?.data.chat_from }
                msgText={postInfo.data?.data?.post_text || chatInfo.data?.data.chat_body_text}
                msgChannelName={postInfo.data?.data?.post_channel?.ch_name}
                msgChannelUUID={postInfo.data?.data?.post_channel?.ch_uuid}
                msgUUID={postInfo.data?.data?.post_uuid || chatInfo.data?.data.chat_uuid}
                msgCreatedAt={postInfo.data?.data?.post_created_at || chatInfo.data?.data.chat_created_at}

            />
            </div>
        </div>
    );
}
