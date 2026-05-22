"use client";

import { useRef, useEffect } from "react";
import { useMedia } from "@/context/MediaQueryContext";
import { MobileTextInput } from "@/components/textInput/mobileTextInput";
import { ChannelIdDesktop } from "@/components/channel/chanelIdDesktop";
import {useParams} from "next/navigation";
import {ChannelIdMobile} from "@/components/channel/channelIdMobile";
import {CreateOrUpdatePostsReq, CreatePostPaginationResRaw, CreatePostsRes, PostsRes} from "@/types/post";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {
    clearChannelInputState,
    createPostLocally,
    updateChannelCallStatus,
    updateChannelScrollToBottom
} from "@/store/slice/channelSlice";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {usePost} from "@/hooks/usePost";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {ChannelInfoInterface, ChannelInfoInterfaceResp} from "@/types/channel";
import {addUserChannelList, resetUserChannelUnread} from "@/store/slice/userSlice";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {MessageInputState} from "@/store/slice/channelSlice";


const EMPTY_POSTS: PostsRes[] = []
const EMPTY_INPUT_STATE: MessageInputState = { inputTextHTML: '', filesUploaded: [], filePreview: [] }

export default function Page() {
    const params = useParams()
    const channelId = params?.['channel-id'] as string;

    const post = usePost()

    const channelPostState = useSelector((state: RootState) => state.channel.channelPosts[channelId] || EMPTY_POSTS);

    const channelState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || EMPTY_INPUT_STATE);

    const dispatch = useDispatch();

    const channelInfo  = useFetch<ChannelInfoInterfaceResp>(channelId ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : '')

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const latestMsg = useFetch<CreatePostPaginationResRaw>( channelId ? GetEndpointUrl.GetChannelLatestPost + '/' + channelId : '')

    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelInSidebar = userChannels.find((ch: ChannelInfoInterface) => ch.ch_uuid === channelId);
    const unreadCountRef = useRef(channelInSidebar?.unread_post_count || 0);

    const { isMobile, isDesktop } = useMedia();

    useEffect(() => {

        if(channelInfo.data?.channel_info) {
            dispatch(addUserChannelList({channelUser: channelInfo.data?.channel_info}))

            dispatch(updateChannelCallStatus({channelId: channelId, callStatus: channelInfo.data?.channel_info.ch_call_active || false}))
        }


    }, [channelInfo.data?.channel_info]);

    useEffect(() => {
        if(channelId) {
            dispatch(resetUserChannelUnread({ch_uuid: channelId}))
        }
    }, [channelId]);

    if(!channelId) return


    const handleSend = (latestContent?: string) => {

        // Prefer the editor's latest HTML (passed in by the input wrapper
        // after flushing its pending throttle window) over the Redux
        // snapshot, which can lag by one keystroke and cause the last
        // typed character to be dropped from the sent message.
        const rawBody = latestContent ?? channelState.inputTextHTML
        const body = removeEmptyPTags(rawBody)

        if(body.length==0) return


        post.makeRequest<CreateOrUpdatePostsReq, CreatePostsRes>({
            apiEndpoint: PostEndpointUrl.CreateChannelPost,
            payload: {
                post_attachments: channelState.filesUploaded,
                channel_id: channelId,
                post_text_html: body
            }
        })
            .then((res)=>{

                if (
                    res &&
                    (latestMsg?.data?.data?.posts?.[0]?.post_uuid &&
                    channelPostState?.length > 0 &&
                    channelPostState[channelPostState.length - 1]?.post_uuid &&
                    latestMsg.data.data.posts[0].post_uuid === channelPostState[channelPostState.length - 1].post_uuid)
                    ||
                    (channelPostState?.length == 0)
                ) {
                    dispatch(createPostLocally({
                        channelId,
                        postCreatedAt:res?.post_created_at || '',
                        postBy: selfProfile.data?.data || {} as UserProfileDataInterface,
                        postText: body,
                        attachments: channelState.filesUploaded,
                        postUUID: res?.uuid || '',
                    }))

                    latestMsg.mutate()
                    if(channelPostState.length > 2) {
                        dispatch(updateChannelScrollToBottom({channelId, scrollToBottom: true}))
                    }


                }

            })
        dispatch(clearChannelInputState({channelId}))
    }

    return (
        <>

            {isMobile && <ChannelIdMobile channelId={channelId} handleSend={handleSend} unreadCount={unreadCountRef.current}/>}

            {isDesktop && <ChannelIdDesktop channelId={channelId} handleSend={handleSend} unreadCount={unreadCountRef.current}/>}
        </>
    );
}
