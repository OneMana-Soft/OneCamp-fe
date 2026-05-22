"use client";


import {useParams} from "next/navigation";
import {MobilePost} from "@/components/mobilePost/mobilePost";
import {MobileChannelPostTextInput} from "@/components/textInput/mobileChannelPostTextInput";
import {useFetch} from "@/hooks/useFetch";
import {CreatePostPaginationResRaw, PostsRes} from "@/types/post";
import {GetEndpointUrl} from "@/services/endPoints";
import {useEffect} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import {updateChannelPosts} from "@/store/slice/channelSlice";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {app_channel_path} from "@/types/paths";


export default function Page() {

    const params = useParams()
    const channelId = params?.["channel-id"] as string
    const postId = params?.["post-id"] as string

    const dispatch = useDispatch();

    const getNewPostsWithCurrentPost = useFetch<CreatePostPaginationResRaw>(postId ? GetEndpointUrl.GetNewPostIncludingCurrentPost + '/' + channelId + '/' + postId: '')

    const channelState = useSelector((state: RootState) => state.channel.channelPosts[channelId] || []);

    const postState = channelState?.find((p: PostsRes) => p.post_uuid === postId);


    useEffect(() => {

        if(getNewPostsWithCurrentPost.data?.data?.posts && !postState) {
            const newPosts = [...(getNewPostsWithCurrentPost.data?.data?.posts ?? [])].reverse();
            dispatch(updateChannelPosts({channelId, posts: newPosts}))
        }


    }, [getNewPostsWithCurrentPost.data?.data]);

    if(!postId || !channelId ) return

    return (
        <div className='flex flex-col h-full'>
            <MobilePost postUUID={postId} channelId={channelId}/>
            <div>
                <MobileChannelPostTextInput channelId={channelId} postUUID={postId}/>
            </div>

        </div>
    )
}
