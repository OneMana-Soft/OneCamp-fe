import { displayNameOf } from "@/lib/personName"
import { THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import {useDispatch, useSelector} from "react-redux"
import type { RootState } from "@/store/store"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {CreateOrUpdatePostsReq, PostsResRaw} from "@/types/post";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {getForwardedMessageData, getMainMessageData, getReplyMessageData} from "@/lib/utils/rightPanelHelper";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {ThreadLoadFailed} from "@/components/rightPanel/threadLoadFailed";
import {OWN_ERRORS} from "@/lib/axiosInstance";
import {closeRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {MessageContent} from "@/components/rightPanel/messageContent";
import {ReplyDivider} from "@/components/rightPanel/replyDivider";
import {ThreadSummaryButton} from "@/components/ai/ThreadSummaryButton";
import {CommentsList} from "@/components/rightPanel/commentsList";
import { ThreadEmpty } from "@/components/rightPanel/threadEmpty";
import {AgentWorkStrip} from "@/components/ai/AgentWorkStrip";
import {RightPanelHeader} from "@/components/rightPanel/rightPanelHeader";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {openUI} from "@/store/slice/uiSlice";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {
    addChannelComments,
    clearChannelCommentMsgInputState,
    createChannelComment,
    createChannelCommentReaction,
    createOrUpdateChannelCommentMsg,
    removeChannelComment,
    removeChannelCommentReaction,
    setChannelCommentAlsoSend,
    updateChannelCommentReaction,
    updateChannelCommentReactionId
} from "@/store/slice/channelCommentSlice";
import {ChannelCommentFileUpload} from "@/components/fileUpload/channelCommentFileUpload";
import { SendHorizontal } from "@/lib/icons";
import { Checkbox } from "@/components/ui/checkbox";
import {usePost} from "@/hooks/usePost";
import { useSaveEdit } from "@/hooks/useSaveEdit"
import {
    CreateCommentResInterface,
     CreateUpdateCommentReqInterface,
} from "@/types/comment";
import {useRef} from "react";
import {CreateOrUpdateCommentReaction, CreateOrUpdatePostReaction} from "@/types/reaction";
import {
    createPostReactionPostId,

    removePostByPostId,
    removePostReactionByPostId,
    updateChannelMessageReplyDecrement,
    updateChannelMessageReplyIncrement,
    updatePostReactionPostId
} from "@/store/slice/channelSlice";
import {UserProfileInterface} from "@/types/user";
import {useUploadFile} from "@/hooks/useUploadFile";
import { useThreadReplies } from "@/components/rightPanel/useThreadReplies";

// Module-level, so a selector that finds nothing returns the same value every
// time: a fresh [] or {} per call re-drew the thread on every store change.
const NO_ITEMS: never[] = []
const NO_DRAFT = {}

export const ChannelComments = () => {
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState)
    const sidebarChannelName = useSelector((state: RootState) => state.users.userSidebar.userChannels?.find((c) => c.ch_uuid === state.rightPanel.rightPanelState.data.channelUUID)?.ch_name)


    // The reply being written: this thread's own draft (MC-BUG-1).
    const channelCommentState = useSelector((state: RootState) => state.channelComment.commentInputState[rightPanelState.data.postUUID] || NO_DRAFT)
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const uploadFile = useUploadFile()

    const channelState = useSelector((state: RootState) => state.channel.channelPosts[rightPanelState.data.channelUUID] || NO_ITEMS);

    const postCommentState = useSelector((state: RootState) => state.channelComment.postComments[rightPanelState.data.postUUID] || NO_ITEMS);


    const postInfo = useFetch<PostsResRaw>(
        rightPanelState.data.channelUUID && rightPanelState.data.postUUID ? `${GetEndpointUrl.GetPostWithAllComments}/${rightPanelState.data.postUUID}` : "",
        undefined, undefined, OWN_ERRORS,
    )

    const dispatch = useDispatch()

    const post = usePost()
    const saveEdit = useSaveEdit()

    // The root from the conversation's loaded messages, live; else from the
    // thread's own answer. A link to an older message in a conversation already
    // in memory left the root out of the list, and the thread spun (FE-BUG-8).
    const postState = channelState?.find(p => p.post_uuid === rightPanelState.data.postUUID) ?? postInfo.data?.data;

    const pendingCommentReactionDeletes = useRef<Set<string>>(new Set())

    // "Also send to channel" (Slack parity): the reply is also posted as a
    // top-level message in the channel. Part of the thread's draft, like its text.
    const alsoSendToChannel = !!channelCommentState.alsoSendToChannel


    // The server's replies, reconciled once per answer (useThreadReplies).
    useThreadReplies(postInfo.data?.data?.post_comments, postInfo.lastRequestStartedAt, postCommentState, (comments) =>
        dispatch(addChannelComments({ postId: rightPanelState.data.postUUID, comments })),
    )


    // The error first: a failed read has no data, which read as loading (TN-BUG-4).
    if (postInfo.isError && !postInfo.data?.data) {
        return (
            <div className="flex h-full flex-col bg-panel">
                <RightPanelHeader titleKey={'thread'}/>
                <ThreadLoadFailed error={postInfo.isError} onRetry={() => void postInfo.mutate()} retrying={postInfo.isLoading} onClose={() => dispatch(closeRightPanel())}/>
            </div>
        )
    }

    if (postInfo.isLoading || !postInfo.data?.data || !postState) {
        return <LoadingStateCircle />
    }


    const mainMessageData = getMainMessageData(postState)
    const forwardedMessageData = getForwardedMessageData(postState)
    const replyMessageData = getReplyMessageData(postState)


    // The message's own menu has asked already, in place (DeleteConfirm): no
    // dialog half a second later, and no toast once it's gone (SD-5).
    const handleDeletePost = (postId: string) => {
        if (postId) executeDeletePost(postId)
    }

    const executeDeletePost = (postId: string) => {

        post.makeRequest<CreateOrUpdatePostsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChannelPost,
            payload: {
                post_id: postId
            },
            showErrorToast: true
        })
            .then(() => {
                dispatch(removePostByPostId({postId, channelId: rightPanelState.data.channelUUID}))
            })
            // A refusal is said by its request (usePost's toast), and the message
            // stays: it leaves only once the server has deleted it.
            .catch(() => {})

    }

    const handleDeletePostComment = (commentUUID: string, commentIndex: number) => {
        if (commentUUID) executeDeletePostComment(commentIndex, commentUUID)
    }


    const executeDeletePostComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.RemovePostComment,
            payload: {
                post_id: rightPanelState.data.postUUID,
                comment_id: commentUUID,
            },
            showErrorToast: true
        })
            .then(() => {
                dispatch(removeChannelComment({postId: rightPanelState.data.postUUID, commentIndex}))
                // dispatch(decrementPostCommentCountByPostID({channelId: rightPanelState.data.channelUUID, postId: rightPanelState.data.postUUID}))
                dispatch(updateChannelMessageReplyDecrement({channelId: rightPanelState.data.channelUUID, messageId: rightPanelState.data.postUUID, comment:{comment_uuid: commentUUID, comment_text:"", comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))


            })
            // A refusal is said by its request (usePost's toast), and the message
            // stays: it leaves only once the server has deleted it.
            .catch(() => {})

    }

    const handleUpdatePostComment = (id: string, html: string) => saveEdit({ kind: "postReply", postId: rightPanelState.data.postUUID, id }, html)

    // A correction to the thread's message or a reply saves as in the list:
    // at once, and back with the box open on what was typed when the save
    // fails (hooks/useSaveEdit, F-06). Both take the message's id first.
    const handleUpdatePost = (id: string, html: string) => saveEdit({ kind: "post", channelId: rightPanelState.data.channelUUID, id }, html)

    const handleSend = (latestContent?: string) => {
        // The thread this reply was written in: its draft is the one emptied
        // once the server answers, whichever thread is open by then.
        const threadId = rightPanelState.data.postUUID
        const files = channelCommentState.filesUploaded ?? []

        const rawBody = latestContent ?? channelCommentState.commentMsgBody
        const body = removeEmptyPTags(rawBody)
        const hasAttachments = files.length > 0
        if (!body && !hasAttachments) return

        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreatePostComment,
            payload: {
                post_id: threadId,
                comment_attachments: files,
                comment_text_html: body,
                also_send_to_channel: alsoSendToChannel,
            }
        })
            .then((res)=>{

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChannelComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: body, postId: threadId, commentBy: selfProfile.data?.data, attachments: files}))

                }

                // postInfo.mutate()
                dispatch(clearChannelCommentMsgInputState({threadId, sent: files.map((f) => f.attachment_obj_key)}))

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


    const threadKey = rightPanelState.data.postUUID || rightPanelState.data.chatMessageUUID
    // Where the thread lives: the post says when the server includes its
    // channel, and the sidebar knows every channel the reader is in. The post
    // rarely says, so the header was a bare "Thread" and the checkbox "Also
    // send to channel" (C36: "in #engineering", "Also send to #engineering").
    const channelName = postInfo.data?.data?.post_channel?.ch_name || sidebarChannelName
    return (
        // The thread panel (design v3 chat, C36): a layer of the sheet (the
        // task panel's darker step in dark). Its contents move, never the
        // column: x 16px to rest and a fade, 240 ms; another thread fades in.
        <div key={threadKey} data-right-panel-thread="" className="flex h-full flex-col bg-panel animate-panel-in">
            <RightPanelHeader titleKey={'thread'} subtitle={channelName ? `in #${channelName}` : undefined} subtitleHref={channelName ? `/app/channel/${rightPanelState.data.channelUUID}` : undefined}/>

                <div className="pt-3" />
                <MessageContent
                    root
                    userInfo={mainMessageData.userInfo}
                    createdAt={mainMessageData.createdAt}
                    updatedAt={mainMessageData.updatedAt}
                    content={mainMessageData.content}
                    forwardedMessage={forwardedMessageData}
                    replyMessage={replyMessageData}
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

                {/* TL;DR for long threads — calm, on-demand. Reuses doc-AI
                    summarize over the assembled root + replies text. Each line
                    is attributed with the author so the recap can say who said
                    what ("@alex asked… @sam replied…"). */}
                {mainMessageData.commentCount >= 4 && (
                    <div className="mx-4 mt-2">
                        <ThreadSummaryButton
                            getText={() =>
                                [
                                    `${mainMessageData.userName || "Someone"}: ${mainMessageData.content}`,
                                    ...postCommentState.map(
                                        (c) => `${displayNameOf(c.comment_by) || "Someone"}: ${c.comment_text}`,
                                    ),
                                ].join("\n")
                            }
                        />
                    </div>
                )}

            <div className="min-h-0 flex-1 overflow-y-auto pb-3 pt-1">


                <CommentsList
                    empty={<ThreadEmpty />}
                    comments={postCommentState}
                    removeReaction={removeCommentReaction}
                    addOrUpdateReaction={createOrUpdateCommentReaction}
                    removeComment={handleDeletePostComment}
                    updateComment={handleUpdatePostComment}
                    getMediaURL={GetEndpointUrl.GetChannelMedia + '/' + rightPanelState.data.channelUUID}

                />

                {/* An AI teammate working in THIS thread, with the control to
                    stop it. Renders nothing when no agent is working here, so a
                    normal thread is untouched; the count of comments is used as
                    the revalidation signal, since a new reply is exactly when
                    agent work tends to start, change, or be steered. */}
                <AgentWorkStrip
                    entityId={rightPanelState.data.postUUID}
                    revalidateKey={postCommentState.length}
                />


            </div>
            {/* The reply box at the panel's foot, the composer at its compact size.
                A command typed here runs in the thread's conversation (FE-BUG-11). */}
            <div className="shrink-0 px-3 pb-3 pt-1" data-command-surface={rightPanelState.data.channelUUID}>
                <MinimalTiptapTextInput
                    throttleDelay={300}
                    attachmentOnclick = {()=> {
                                dispatch(openUI({ key: 'channelCommentFileUpload' }))
}
                    }
                    onActionFiles={async (files) => {
                        if (!files?.length) return;
                        await uploadFile.makeRequestToUploadToChannelComment(files as unknown as FileList, rightPanelState.data.channelUUID, rightPanelState.data.postUUID);
                    }}
                    ButtonIcon={SendHorizontal}
                    hasAttachments={(channelCommentState.filesUploaded?.length ?? 0) > 0}
                    buttonOnclick={handleSend}
                    variant="chat"
                    compact
                    output="html"
                    placeholder={THREAD_COMPOSER_PLACEHOLDER}
                    editable={true}
                    editorClassName="focus:outline-none"
                    onChange={(content ) => {
                        dispatch(createOrUpdateChannelCommentMsg({threadId: rightPanelState.data.postUUID, body: content as string}))
                    }}
                    content={channelCommentState?.commentMsgBody || null}
                >
                    <ChannelCommentFileUpload channelId={rightPanelState.data.channelUUID} threadId={rightPanelState.data.postUUID}/>

                </MinimalTiptapTextInput>

                <label className="mt-2 flex h-5 cursor-pointer select-none items-center gap-2 px-1 text-ui-sm text-ink-2">
                    <Checkbox
                        checked={alsoSendToChannel}
                        onCheckedChange={(v) => dispatch(setChannelCommentAlsoSend({threadId: rightPanelState.data.postUUID, on: v === true}))}
                    />
                    {channelName ? `Also send to #${channelName}` : "Also send to channel"}
                </label>
            </div>
        </div>
    )
}
