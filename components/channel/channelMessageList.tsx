"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { CreatePostPaginationResRaw, PostsRes} from "@/types/post";
import {useEffect, useState, useMemo} from "react";
import {updateChannelPosts, updateChannelScrollToBottom, mergeChannelPosts} from "@/store/slice/channelSlice";
import {ChannelMessages} from "@/components/channel/channelMessages";
import {useMessageResync} from "@/hooks/useMessageResync";
import {TypingIndicatorBar} from "@/components/typingIndicator/typingIndicatorBar";
import {UserProfileInterface} from "@/types/user";
import { LoaderCircle } from "@/lib/icons";
import {ChatLoadingSkeleton} from "@/components/chat/ChatLoadingSkeleton";
import {useSearchParams} from "next/navigation";
import {useMedia} from "@/context/MediaQueryContext";

interface ChannelMessageListProps {
    channelId: string;
    postId?: string;
    isAdmin?: boolean;
}

const EMPTY_POSTS: PostsRes[] = []

const EMPTY_TYPING_LIST: any[] = []

export const ChannelMessageList = ({channelId, postId: propPostId, isAdmin}: ChannelMessageListProps) => {

    const { isMobile } = useMedia();
    const searchParams = useSearchParams();
    const postId = propPostId || searchParams?.get('postId') || undefined;
    const latestMsg = useFetch<CreatePostPaginationResRaw>(postId ? '' : GetEndpointUrl.GetChannelLatestPost + '/' + channelId)
    const getNewPostsWithCurrentPost = useFetch<CreatePostPaginationResRaw>(postId ? GetEndpointUrl.GetNewPostIncludingCurrentPost + '/' + channelId + '/' + postId: '')

    // Revalidate the latest window on open/switch so a revisited channel picks
    // up posts that arrived while away (notification deep-link). The merge
    // effect reconciles without clobbering optimistic sends.
    useEffect(() => {
        if (!postId && channelId) {
            void latestMsg.mutate()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId, postId])

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
        } else if (!postId && latestMsg.data?.data?.posts && channelPostState.length > 0) {
            // Already-loaded channel revisited (navigation / notification
            // deep-link): merge the fresh latest window so a post that arrived
            // while away appears without a hard refresh. Preserves optimistic
            // sends + paginated history; no-op when nothing changed.
            const latest = [...latestMsg.data.data.posts].reverse();
            dispatch(mergeChannelPosts({ channelId, posts: latest }))
        }

    }, [getNewPostsWithCurrentPost, latestMsg, channelPostState, postId, channelId, dispatch]);

    useEffect(() => {

        if(channelPostState && oldMsg.data?.data && oldChannelPostTime != 0) {
            setHasMoreOldPost(oldMsg.data.data.has_more)
            setOldChannelPostTime(0)
            if(oldMsg.data?.data.posts && oldMsg.data?.data.posts.length !== 0) {
                const existingUuids = new Set(channelPostState.map(p => p.post_uuid))
                // Copy before reversing — don't mutate the live SWR cache.
                const dedupedOld = [...oldMsg.data.data.posts].reverse().filter(p => !existingUuids.has(p.post_uuid))
                const posts = dedupedOld.concat(channelPostState)
                dispatch(updateChannelPosts({channelId: channelId, posts: posts}))
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

    // Reconcile against the server when MQTT recovers from a long gap
    // (idle tab). Window-reconcile: applies missed posts, edits, and deletes
    // within the latest window without clearing what's already on screen.
    // Disabled in permalink mode (postId) where the user is parked on an
    // older post.
    useMessageResync<PostsRes>({
        enabled: !postId,
        latestUrl: postId ? '' : GetEndpointUrl.GetChannelLatestPost + '/' + channelId,
        extract: (payload) => {
            const posts = payload?.data?.posts as PostsRes[] | undefined
            return posts ? [...posts].reverse() : undefined
        },
        onMerge: (posts) => dispatch(mergeChannelPosts({ channelId, posts })),
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

            <TypingIndicatorBar users={channelTypingState} />

        </div>
    )

}