import {useDispatch, useSelector} from "react-redux"
import type { RootState } from "@/store/store"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {CreateOrUpdatePostsReq, CreatePostsRes, PostsResRaw} from "@/types/post";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {getForwardedMessageData, getMainMessageData} from "@/lib/utils/rightPanelHelper";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {ErrorState} from "@/components/error/errorState";
import {MessageContent} from "@/components/rightPanel/messageContent";
import {ReplyDivider} from "@/components/rightPanel/replyDivider";
import {CommentsList} from "@/components/rightPanel/commentsList";
import {RightPanelHeader} from "@/components/rightPanel/rightPanelHeader";
import {cn} from "@/lib/utils/helpers/cn";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {openUI} from "@/store/slice/uiSlice";
import {
    addChannelComments,
    clearChannelCommentMsgInputState,
    createChannelComment,
    createChannelCommentReaction,
    createOrUpdateChannelCommentMsg,
    removeChannelComment,
    removeChannelCommentReaction,
    updateChannelComment,
    updateChannelCommentReaction,
    updateChannelCommentReactionId
} from "@/store/slice/channelCommentSlice";
import {ChannelCommentFileUpload} from "@/components/fileUpload/channelCommentFileUpload";
import {SendHorizontal} from "lucide-react";
import {usePost} from "@/hooks/usePost";
import {
    CreateCommentResInterface,
     CreateUpdateCommentReqInterface,
     CommentInfoInterface,
} from "@/types/comment";
import {useEffect, useRef} from "react";
import {CreateOrUpdateCommentReaction, CreateOrUpdatePostReaction} from "@/types/reaction";
import {
    createPostReactionPostId,

    removePostByPostId,
    removePostReactionByPostId,
    updateChannelMessageReplyDecrement,
    updateChannelMessageReplyIncrement,
    updatePostByPostId,
    updatePostReactionPostId
} from "@/store/slice/channelSlice";
import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {useUploadFile} from "@/hooks/useUploadFile";

export const ChannelComments = () => {
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState)

    const EMPTY_INPUT_STATE = {};
    const EMPTY_POSTS: any[] = []; // Using any[] to match the inferred type if needed, or better typed if possible. Based on usage it seems to be an array of posts.
    const EMPTY_COMMENTS: CommentInfoInterface[] = [];

    const channelCommentState = useSelector((state: RootState) => state.channelComment.commentInputState[rightPanelState.data.channelUUID] || EMPTY_INPUT_STATE)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const uploadFile = useUploadFile()

    const channelState = useSelector((state: RootState) => state.channel.channelPosts[rightPanelState.data.channelUUID] || EMPTY_POSTS);

    const postCommentState = useSelector((state: RootState) => state.channelComment.postComments[rightPanelState.data.postUUID] || EMPTY_COMMENTS);


    const postInfo = useFetch<PostsResRaw>(
        rightPanelState.data.channelUUID && rightPanelState.data.postUUID ? `${GetEndpointUrl.GetPostWithAllComments}/${rightPanelState.data.postUUID}` : "",
    )

    const dispatch = useDispatch()

    const post = usePost()
    const handleRetry = () => {
        // Trigger refetch - this would depend on your useFetch implementation
        window.location.reload()
    }

    const postState = channelState?.find(p => p.post_uuid === rightPanelState.data.postUUID);

    const pendingCommentReactionDeletes = useRef<Set<string>>(new Set())


    useEffect(() => {

        if(postInfo.data?.data && postInfo.data.data.post_comments && postCommentState.length == 0) {
            dispatch(addChannelComments({postId: rightPanelState.data.postUUID, comments:postInfo.data.data.post_comments}))
        }



    }, [postInfo.data, postCommentState.length, rightPanelState.data.postUUID, dispatch]);


    if (postInfo.isLoading || !postInfo.data?.data || !postState) {
        return <LoadingStateCircle />
    }

    if (postInfo.isError  ) {
        return <ErrorState onRetry={handleRetry}  errorMessage={'failed to fetch the thread'} errorTitle={'Thread not found'}/>
    }


    const mainMessageData = getMainMessageData(postState)
    const forwardedMessageData = getForwardedMessageData(postState)


    const handleDeletePost = (postId: string) => {

        if(!postId) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting post",
                    description: "Are you sure you want to proceed deleting the post",
                    confirmText: "Delete post",
                    onConfirm: ()=>{executeDeletePost(postId)}
                }
            }));
        }, 500);


    }

    const executeDeletePost = (postId: string) => {

        post.makeRequest<CreateOrUpdatePostsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChannelPost,
            payload: {
                post_id: postId
            },
            showToast: true
        })
            .then(() => {
                dispatch(removePostByPostId({postId, channelId: rightPanelState.data.channelUUID}))
            })

    }

    const handleDeletePostComment = (commentUUID: string, commentIndex: number) => {

        if(!commentUUID) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting post",
                    description: "Are you sure you want to proceed deleting the post comment",
                    confirmText: "Delete post comment",
                    onConfirm: ()=>{executeDeletePostComment(commentIndex, commentUUID)}
                }
            }));
        }, 500);


    }


    const executeDeletePostComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.RemovePostComment,
            payload: {
                post_id: rightPanelState.data.postUUID,
                comment_id: commentUUID,
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeChannelComment({postId: rightPanelState.data.postUUID, commentIndex}))
                // dispatch(decrementPostCommentCountByPostID({channelId: rightPanelState.data.channelUUID, postId: rightPanelState.data.postUUID}))
                dispatch(updateChannelMessageReplyDecrement({channelId: rightPanelState.data.channelUUID, messageId: rightPanelState.data.postUUID, comment:{comment_uuid: commentUUID, comment_text:"", comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))


            })

    }

    const handleUpdatePostComment = ( commentUUID: string, commentHTMLText: string, commentIndex: number) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.UpdatePostComment,
            payload: {
                post_id: rightPanelState.data.postUUID,
                comment_id: commentUUID,
                comment_text_html: commentHTMLText
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateChannelComment({
                        commentIndex: commentIndex,
                        postId: rightPanelState.data.postUUID,
                        htmlText: commentHTMLText,
                    }))
                }

            })
    }

    const handleUpdatePost = (postHTMLText: string, postId: string) => {

        post.makeRequest<CreateOrUpdatePostsReq, CreatePostsRes>({
            apiEndpoint: PostEndpointUrl.UpdateChannelPost,
            payload: {
                post_id: postId,
                post_text_html: postHTMLText
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updatePostByPostId({
                        postId: postId,
                        channelId: rightPanelState.data.channelUUID,
                        htmlText: postHTMLText,
                    }))
                }

            })

    }

    const handleSend = () => {

        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreatePostComment,
            payload: {
                post_id: rightPanelState.data.postUUID,
                comment_attachments: channelCommentState.filesUploaded,
                comment_text_html: channelCommentState.commentMsgBody,
            }
        })
            .then((res)=>{

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChannelComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: channelCommentState.commentMsgBody, postId: rightPanelState.data.postUUID, commentBy: selfProfile.data?.data, attachments:channelCommentState.filesUploaded}))

                }

                // postInfo.mutate()
                dispatch(clearChannelCommentMsgInputState({channelId: rightPanelState.data.channelUUID}))

                dispatch(updateChannelMessageReplyIncrement({channelId: rightPanelState.data.channelUUID, messageId: rightPanelState.data.postUUID, comment:{comment_uuid: res?.comment_id||'', comment_created_at: res?.comment_created_at || new Date().toISOString(), comment_text: "", comment_by: selfProfile.data?.data || {user_uuid: '', user_name: '', user_profile_object_key: ''}}}))


            })
    }

    const createOrUpdateReaction = ( emojiId:string, reactionId:string)=> {

        post.makeRequest<CreateOrUpdatePostReaction, CreateOrUpdatePostReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdatePostReaction,
            payload :{
                post_id: rightPanelState.data.postUUID,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updatePostReactionPostId({channelId: rightPanelState.data.channelUUID, reactionId, emojiId, postId:rightPanelState.data.postUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createPostReactionPostId({postId:rightPanelState.data.postUUID, channelId: rightPanelState.data.channelUUID, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeReaction = (reactionId:string) => {

        post.makeRequest<CreateOrUpdatePostReaction>({apiEndpoint: PostEndpointUrl.RemovePostReaction,
            payload :{
                post_id: rightPanelState.data.postUUID,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{


                dispatch(removePostReactionByPostId({channelId: rightPanelState.data.channelUUID, reactionId, postId:rightPanelState.data.postUUID}))

            })
    }


    const createOrUpdateCommentReaction = (emojiId:string, reactionId:string, commentId:string, commentIdx: number) => {
        let tempId = ""
        let oldEmojiId = ""

        // Duplicate check
        if (!reactionId) {
            const hasReaction = postCommentState[commentIdx]?.comment_reactions?.some(
                (r) =>
                    r.reaction_emoji_id === emojiId &&
                    r.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid
            )
            if (hasReaction) return
        }

        if (reactionId) {
             // Optimistic Update
            const reaction = postCommentState[commentIdx]?.comment_reactions?.find((r) => r.uid === reactionId)
            oldEmojiId = reaction?.reaction_emoji_id || ""
            dispatch(updateChannelCommentReaction({commentIndex: commentIdx, reactionId, emojiId, postId:rightPanelState.data.postUUID}))

        } else if (selfProfile.data?.data) {
             // Optimistic Create
            tempId = `temp-${Date.now()}`
            dispatch(createChannelCommentReaction({
                postId:rightPanelState.data.postUUID,
                commentIndex: commentIdx,
                reactionId: tempId,
                emojiId,
                addedBy: selfProfile.data?.data
            }))
        }

        post.makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdatePostCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{
                if(reactionId) {
                    // Success
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                     // Create success: Swap temp ID with real ID
                    const realId = res.reaction_dgraph_id
                    dispatch(updateChannelCommentReactionId({
                        postId: rightPanelState.data.postUUID,
                        commentIndex: commentIdx,
                        oldReactionId: tempId,
                        newReactionId: realId
                    }))

                     // Check pending deletes
                    if (pendingCommentReactionDeletes.current.has(tempId)) {
                        pendingCommentReactionDeletes.current.delete(tempId)
                        removeCommentReaction(realId, commentId, commentIdx)
                    }
                }
            })
            .catch(() => {
                // Revert
                if (reactionId) {
                    if (oldEmojiId) {
                        dispatch(updateChannelCommentReaction({commentIndex: commentIdx, reactionId, emojiId: oldEmojiId, postId:rightPanelState.data.postUUID}))
                    }
                } else {
                    dispatch(removeChannelCommentReaction({commentIndex: commentIdx, reactionId: tempId, postId:rightPanelState.data.postUUID}))
                }
            })
    }

    const removeCommentReaction = (reactionId:string, commentId: string, commentIdx: number) => {
         // Handle Race Condition
        if (reactionId.startsWith("temp-")) {
            pendingCommentReactionDeletes.current.add(reactionId)
            dispatch(removeChannelCommentReaction({commentIndex: commentIdx, reactionId, postId:rightPanelState.data.postUUID}))
            return
        }

        // Store reaction data to revert (need to find reaction details first if we want strict revert, but removal usually safe to just re-add if failed)
        // For now, consistent with other implementations, we can try to re-add if needed or just handle optimistic remove.
        // We'll optimistically remove first.
        const reactionToRemove = postCommentState[commentIdx]?.comment_reactions?.find((r) => r.uid === reactionId)

        dispatch(removeChannelCommentReaction({commentIndex: commentIdx, reactionId, postId:rightPanelState.data.postUUID}))

        post.makeRequest<CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.RemovePostCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{
               // Success
            })
            .catch(() => {
                 // Revert
                if (reactionToRemove) {
                    dispatch(createChannelCommentReaction({
                        postId:rightPanelState.data.postUUID,
                        commentIndex: commentIdx,
                        reactionId,
                        emojiId: reactionToRemove.reaction_emoji_id,
                        addedBy: reactionToRemove.reaction_added_by
                    }))
                }
            })
    }


    return (
        <div className="h-full flex flex-col p-4 pb-0">
            <RightPanelHeader titleKey={'thread'}/>

                <MessageContent
                    userInfo={mainMessageData.userInfo}
                    createdAt={mainMessageData.createdAt}
                    content={mainMessageData.content}
                    forwardedMessage={forwardedMessageData}
                    channelUUID={mainMessageData.channelUUID}
                    chatUUID={mainMessageData.chatUUID}
                    removeReaction={removeReaction}
                    addReaction={createOrUpdateReaction}
                    rawReactions={mainMessageData.reactions}
                    deleteMessage={handleDeletePost}
                    updateMessage={handleUpdatePost}
                    postUUID={rightPanelState.data.postUUID}
                    isAdmin={postInfo.data.data.post_channel?.ch_is_admin}
                    getMediaUrl={GetEndpointUrl.GetChannelMedia + '/' + rightPanelState.data.channelUUID}
                    attachments={mainMessageData.attachments}
                />

                {mainMessageData.commentCount > 0 && (

                        <ReplyDivider replyCount={mainMessageData.commentCount} />


                )}

            <div className="flex-1 overflow-y-auto pb-4 pt-2 space-y-4">


                <CommentsList
                    comments={postCommentState}
                    removeReaction={removeCommentReaction}
                    addOrUpdateReaction={createOrUpdateCommentReaction}
                    removeComment={handleDeletePostComment}
                    updateComment={handleUpdatePostComment}
                    getMediaURL={GetEndpointUrl.GetChannelMedia + '/' + rightPanelState.data.channelUUID}

                />

                <MinimalTiptapTextInput
                    throttleDelay={300}
                    attachmentOnclick = {()=> {
                                dispatch(openUI({ key: 'channelCommentFileUpload' }))
}
                    }
                    onActionFiles={async (files) => {
                        if (!files?.length) return;
                        await uploadFile.makeRequestToUploadToChannelComment(files as unknown as FileList, rightPanelState.data.channelUUID);
                    }}
                    ButtonIcon={SendHorizontal}
                    buttonOnclick={handleSend}
                    className={cn("max-w-full rounded-xl h-auto border bg-secondary/20 p-2")}
                    editorContentClassName="overflow-auto"
                    output="html"
                    placeholder={"Add a message, if you'd like..."}
                    editable={true}
                    toggleToolbar={ true}
                    editorClassName="focus:outline-none px-2 py-2"
                    onChange={(content ) => {
                        dispatch(createOrUpdateChannelCommentMsg({channelId:rightPanelState.data.channelUUID, body: content as string}))
                    }}
                    content={channelCommentState?.commentMsgBody || null}
                >
                    <ChannelCommentFileUpload channelId={rightPanelState.data.channelUUID}/>

                </MinimalTiptapTextInput>
            </div>
        </div>
    )
}
