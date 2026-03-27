"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { CreatePostPaginationResRaw, PostsRes} from "@/types/post";
import {useEffect, useState, useMemo} from "react";
import {updateChannelPosts, updateChannelScrollToBottom} from "@/store/slice/channelSlice";
import {ChannelMessages} from "@/components/channel/channelMessages";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {UserProfileInterface} from "@/types/user";
import {LoaderCircle} from "lucide-react";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import {useSearchParams} from "next/navigation";

interface ChannelMessageListProps {
    channelId: string;
    postId?: string;
    isAdmin?: boolean;
}

const EMPTY_POSTS: PostsRes[] = []

const EMPTY_TYPING_LIST: any[] = []

export const ChannelMessageList = ({channelId, postId: propPostId, isAdmin}: ChannelMessageListProps) => {

    const searchParams = useSearchParams();
    const postId = propPostId || searchParams?.get('postId') || undefined;
    const latestMsg = useFetch<CreatePostPaginationResRaw>(postId ? '' : GetEndpointUrl.GetChannelLatestPost + '/' + channelId)
    const getNewPostsWithCurrentPost = useFetch<CreatePostPaginationResRaw>(postId ? GetEndpointUrl.GetNewPostIncludingCurrentPost + '/' + channelId + '/' + postId: '')

    const rawChannelTyping = useSelector((state: RootState) => state.typing.channelTyping[channelId] || EMPTY_TYPING_LIST);
    const channelTypingState = useMemo(() => rawChannelTyping.map(item => item.user), [rawChannelTyping]);

    const channelPostState = useSelector((state: RootState) => state.channel.channelPosts[channelId] || EMPTY_POSTS);

    const [hasMoreOldPost, setHasMoreOldPost] = useState(true)
    const [oldChannelPostTime, setOldChannelPostTime] = useState(0)
    const oldMsg = useFetch<CreatePostPaginationResRaw>(oldChannelPostTime == 0 ? '' : GetEndpointUrl.GetOldPostBefore + '/' + channelId + '/' + oldChannelPostTime)

    const [hasMoreNewPost, setHasMoreNewPost] = useState(!!postId)
    const [newChannelPostsTime, setNewChannelPostsTime] = useState(0)
    const newMsg = useFetch<CreatePostPaginationResRaw>(newChannelPostsTime == 0 ? '' : GetEndpointUrl.GetNewPostAfter + '/' + channelId + '/' + newChannelPostsTime)



    const dispatch = useDispatch();


    useEffect(() => {

        if(postId && getNewPostsWithCurrentPost.data?.data?.posts && channelPostState.length == 0) {
            const newPosts = getNewPostsWithCurrentPost.data?.data?.posts ?? [];
            dispatch(updateChannelPosts({channelId, posts: newPosts}))
        }

        if(!postId && latestMsg.data?.data?.posts && channelPostState.length == 0 ) {
            const newPosts = [...latestMsg.data.data.posts].reverse();
            dispatch(updateChannelPosts({channelId, posts: newPosts}))
        }

    }, [getNewPostsWithCurrentPost, latestMsg]);

    useEffect(() => {

        if(channelPostState && oldMsg.data?.data && oldChannelPostTime != 0) {
            setHasMoreOldPost(oldMsg.data.data.has_more)
            setOldChannelPostTime(0)
            if(oldMsg.data?.data.posts && oldMsg.data?.data.posts.length !== 0) {
                const existingUuids = new Set(channelPostState.map(p => p.post_uuid))
                const dedupedOld = oldMsg.data.data.posts.reverse().filter(p => !existingUuids.has(p.post_uuid))
                const posts = dedupedOld.concat(channelPostState)
                dispatch(updateChannelPosts({channelId: channelId, posts: posts}))
                oldMsg.data.data.posts.reverse()
            }
        }

    }, [ oldMsg.data?.data]);

    useEffect(() => {

        if(channelPostState && newMsg.data?.data && newChannelPostsTime != 0) {
            setHasMoreNewPost(newMsg.data.data.has_more)
            setNewChannelPostsTime(0)
            if(newMsg.data?.data.posts && newMsg.data?.data.posts.length !== 0) {
                const existingUuids = new Set(channelPostState.map(p => p.post_uuid))
                const dedupedNew = newMsg.data.data.posts.filter(p => !existingUuids.has(p.post_uuid))
                const posts = channelPostState.concat(dedupedNew)
                dispatch(updateChannelPosts({channelId: channelId, posts: posts}))
            }
        }
    }, [ newMsg.data?.data]);

    const handleClickedScrollToBottom = () => {

        if(channelPostState[channelPostState.length -1].post_uuid != latestMsg.data?.data?.posts?.[0]?.post_uuid) {
            const newPosts = [...(latestMsg.data?.data?.posts || [])].reverse();
            dispatch(updateChannelPosts({channelId, posts: newPosts}))
        }

        dispatch(updateChannelScrollToBottom({channelId, scrollToBottom: true}))

    }

    const getOldMessages = () => {
        if (channelPostState.length === 0) return
        const lastTimeString = channelPostState[0].post_created_at

        const epochTime = Math.floor(Date.parse(lastTimeString) / 1000);
        setOldChannelPostTime(epochTime)
        setHasMoreOldPost(false)
    }

    const getNewMessages = () => {
        if (channelPostState.length === 0) return
        const lastTimeString = channelPostState[channelPostState.length -1].post_created_at
        const epochTime = Math.ceil(Date.parse(lastTimeString) / 1000);
        setNewChannelPostsTime(epochTime)
        setHasMoreNewPost(false)
    }

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                // console.log("[Sync] Tab visible, fetching new channel posts...");
                getNewMessages();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleVisibilityChange);
        };
    }, [channelPostState]);


    if (latestMsg.isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <ChatLoadingSkeleton />
            </div>
        )
    }

    return (
        <div className='flex flex-col h-full gap-y-2 w-full min-w-0'>
            <ChannelMessages
                posts={channelPostState}
                getNewMessages={getNewMessages}
                getOldMessages={getOldMessages}
                hasMoreNewMsg={hasMoreNewPost}
                hasMoreOldMsg={hasMoreOldPost}
                isNewMsgLoading={newMsg.isLoading}
                isOLdMsgLoading={oldMsg.isLoading}
                clickedScrollToBottom={handleClickedScrollToBottom}
                channelId={channelId}
                isAdmin={isAdmin}
            />

            <TypingIndicator users={channelTypingState}/>

        </div>
    )

}