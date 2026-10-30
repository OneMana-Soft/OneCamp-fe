"use client"


import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {PostsResRaw} from "@/types/post";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { ChatGet } from "@/services/endpoints/chat";
import {useDispatch, useSelector} from "react-redux";
import {
    CreateOrUpdateCommentReaction,
    type CreateOrUpdatePostReaction,

} from "@/types/reaction";
import {MobileMessage} from "@/components/mobileMessage/mobileMessage";
import {getForwardedMessageData, getMainMessageData, getReplyMessageData} from "@/lib/utils/rightPanelHelper";
import {MobileMessageCommentList} from "@/components/mobileMessage/mobileMessageCommentList";
import {ReplyDivider} from "@/components/rightPanel/replyDivider";
import {ThreadLoadFailed} from "@/components/rightPanel/threadLoadFailed";
import {OWN_ERRORS} from "@/lib/axiosInstance";
import { UserProfileInterface} from "@/types/user";
import {
    addChannelComments,
    createChannelCommentReaction, removeChannelComment, removeChannelCommentReaction, updateChannelCommentReaction
} from "@/store/slice/channelCommentSlice";
import type {RootState} from "@/store/store";
import {openUI} from "@/store/slice/uiSlice";
import {
    createPostReactionPostId,
    removePostReactionByPostId, updateChannelMessageReplyDecrement, updatePostReactionPostId
} from "@/store/slice/channelSlice";
import {usePost} from "@/hooks/usePost";
import { useSaveEdit } from "@/hooks/useSaveEdit"
import { useDeleteMessage } from "@/hooks/useDeleteMessage";
import { useRouter } from "next/navigation";
import { app_channel_path } from "@/types/paths";
import {CreateUpdateCommentReqInterface} from "@/types/comment";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useThreadReplies } from "@/components/rightPanel/useThreadReplies";

// Module-level, so a selector that finds nothing returns the same value every
// time: a fresh [] per call re-drew the thread on every store change.
const NO_ITEMS: never[] = []

export const MobilePost = ({ channelId, postUUID }: { channelId: string, postUUID: string }) => {

    const postInfo = useFetch<PostsResRaw>(
        channelId && postUUID ? `${ChatGet.GetPostWithAllComments}/${postUUID}` : "",
        undefined, undefined, OWN_ERRORS,
    )

    const channelState = useSelector((state: RootState) => state.channel.channelPosts[channelId] || NO_ITEMS);

    const postState = channelState?.find(p => p.post_uuid === postUUID);

    const postCommentState = useSelector((state: RootState) => state.channelComment.postComments[postUUID] || NO_ITEMS);

    const post = usePost()
    const saveEdit = useSaveEdit()
    const deleteMessage = useDeleteMessage()
    const router = useRouter()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)



    const dispatch = useDispatch()

    // The server's replies, reconciled once per answer (useThreadReplies).
    useThreadReplies(postInfo.data?.data?.post_comments, postInfo.lastRequestStartedAt, postCommentState, (comments) =>
        dispatch(addChannelComments({ postId: postUUID, comments })),
    )


    // The error first: a failed read has no data, which read as loading (TN-BUG-4).
    if (postInfo.isError && !postInfo.data?.data) {
        return <ThreadLoadFailed error={postInfo.isError} onRetry={() => void postInfo.mutate()} retrying={postInfo.isLoading}/>
    }

    if (postInfo.isLoading || !postState || !postInfo.data?.data) {
        return <div role="status" aria-label="Loading comments"><SkeletonRows rows={4} lines={2} /></div>
    }


    const mainMessageData = getMainMessageData(postState)
    const forwardedMessageData = getForwardedMessageData(postState)
    const replyMessageData = getReplyMessageData(postState)

    const handleDeletePost = () => {
        if (!postUUID) return


        setTimeout(() => {
            dispatch(
                openUI({
                    key: 'confirmAlert',
                    data: {
                        title: "Delete this message?",
                        description: "It's removed from the channel for everyone. This can't be undone.",
                        confirmText: "Delete message",
                        destructive: true,
                        onConfirm: () => {
                            setTimeout(() => {executeDeletePost(postUUID)},100)
                        },
                    }
                }),
            )
        }, 500)
    }

    // A correction to the thread's message or a reply saves as in the list:
    // at once, and back with the box open on what was typed when the save
    // fails (hooks/useSaveEdit, F-06). Both take the message's id first.
    const handleUpdatePost = (id: string, html: string) => saveEdit({ kind: "post", channelId, id }, html)

    // The thread's message leaves at once, and the page goes back to its
    // channel, which shows the delete or, if refused, the message put back
    // (QA F-02). The page used to wait on a loading row for ever.
    const executeDeletePost = (postId: string) => {
        void deleteMessage({ kind: "post", channelId, id: postId })
        router.replace(`${app_channel_path}/${channelId}`)
    }


    const createOrUpdateReaction = ( emojiId: string, reactionId: string) => {
        if (!postUUID) return

        post
            .makeRequest<CreateOrUpdatePostReaction, CreateOrUpdatePostReaction>({
                apiEndpoint: PostEndpointUrl.CreateOrUpdatePostReaction,
                payload: {
                    post_id: postUUID,
                    reaction_emoji_id: emojiId,
                    reaction_dgraph_id: reactionId,
                },
            })
            .then((res) => {
                if (reactionId) {
                    dispatch(updatePostReactionPostId({ channelId, reactionId, emojiId, postId:postUUID }))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data) {
                    dispatch(
                        createPostReactionPostId({
                            postId: postUUID,
                            channelId,
                            reactionId: res?.reaction_dgraph_id,
                            emojiId,
                            addedBy: selfProfile.data?.data,
                        }),
                    )
                }
            })
    }


    const removeReaction = (reactionId: string) => {
        post
            .makeRequest<CreateOrUpdatePostReaction>({
                apiEndpoint: PostEndpointUrl.RemovePostReaction,
                payload: {
                    post_id: postUUID,
                    reaction_dgraph_id: reactionId,
                },
            })
            .then(() => {
                dispatch(removePostReactionByPostId({ channelId: channelId, reactionId, postId: postUUID }))
            })
    }

    const createOrUpdateCommentReaction = (emojiId:string, reactionId:string, commentId:string, commentIdx: number) => {
        post.makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdatePostCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateChannelCommentReaction({commentIndex: commentIdx, reactionId, emojiId, postId:postUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createChannelCommentReaction({postId:postUUID, commentIndex: commentIdx, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeCommentReaction = (reactionId:string, commentId: string, commentIdx: number) => {

        post.makeRequest<CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.RemovePostCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{


                dispatch(removeChannelCommentReaction({commentIndex: commentIdx, reactionId, postId:postUUID}))

            })
    }

    const handleUpdatePostComment = (id: string, html: string) => saveEdit({ kind: "postReply", postId: postUUID, id }, html)

    const handleDeletePostComment = (commentUUID: string, commentIndex: number) => {

        if(!commentUUID) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Delete this reply?",
                    description: "It's removed from the thread for everyone. This can't be undone.",
                    confirmText: "Delete reply",
                    destructive: true,
                    onConfirm: ()=>{executeDeletePostComment(commentIndex, commentUUID)}
                }
            }));
        }, 500);


    }

    const executeDeletePostComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.RemovePostComment,
            payload: {
                post_id: postUUID,
                comment_id: commentUUID,
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeChannelComment({postId: postUUID, commentIndex}))
                // dispatch(decrementPostCommentCountByPostID({channelId: rightPanelState.data.channelUUID, postId: rightPanelState.data.postUUID}))
                dispatch(updateChannelMessageReplyDecrement({channelId: channelId, messageId: postUUID, comment:{comment_uuid: commentUUID, comment_text:"", comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))


            })

    }



    return (
            // The room under the last reply for the box's sheet, which floats
            // over the page (phone.css): the last reply sat under the box.
            <div className="flex-1 min-h-0 overflow-y-auto pb-[var(--phone-composer-room)]">
                <MobileMessage
                    userInfo={mainMessageData.userInfo}
                    createdAt={mainMessageData.createdAt}
                    content={mainMessageData.content}
                    forwardedMessage={forwardedMessageData}
                    replyMessage={replyMessageData}
                    getMediaUrl={GetEndpointUrl.GetChannelMedia + '/' + channelId}
                    rawReactions={mainMessageData.reactions}
                    addReaction={createOrUpdateReaction}
                    attachments={mainMessageData.attachments}
                    removeReaction={removeReaction}
                    channelUUID={channelId}
                    postUUID={postUUID}
                    deleteMessage={handleDeletePost}
                    updateMessage={handleUpdatePost}
                    isAdmin={postInfo.data.data.post_channel?.ch_is_admin}
                />
                <ReplyDivider replyCount={mainMessageData.commentCount}/>

                    <MobileMessageCommentList
                        comments={postCommentState}
                        addReaction={createOrUpdateCommentReaction}
                        removeReaction={removeCommentReaction}
                        updateMessage={handleUpdatePostComment}
                        deleteMessage={handleDeletePostComment}
                        getMediaURL={GetEndpointUrl.GetChannelMedia + '/' + channelId}
                        channelUUID={channelId}
                        postUUID={postUUID}
                        isAdmin={postInfo.data.data.post_channel?.ch_is_admin}

                    />

            </div>

    )
}