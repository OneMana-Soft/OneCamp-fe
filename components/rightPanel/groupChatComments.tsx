import { displayNameOf } from "@/lib/personName"
import {useDispatch, useSelector} from "react-redux"
import type { RootState } from "@/store/store"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { ChatGet } from "@/services/endpoints/chat";
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
import {RightPanelHeader} from "@/components/rightPanel/rightPanelHeader";
import { FollowThreadButton } from "@/components/conversation/FollowThread";
import {usePost} from "@/hooks/usePost";
import { useSaveEdit } from "@/hooks/useSaveEdit"
import { CreateUpdateCommentReqInterface } from "@/types/comment";
import {useRef} from "react";
import {UserProfileInterface} from "@/types/user";


import {CreateOrUpdateChatReaction, CreateOrUpdateCommentReaction} from "@/types/reaction";
import {ChatInfoRes, CreateOrUpdateChatsReq} from "@/types/chat";
import { addChatComments, createChatCommentReaction, removeChatComment, removeChatCommentReaction, updateChatCommentReaction, updateChatCommentReactionId } from "@/store/slice/chatCommentSlice";
import {
    
    
    RemoveMessageFromChatList
} from "@/store/slice/chatSlice";
import { createGroupChatReactionChatId, removeGroupChatByChatId, removeGroupChatReactionByChatId, updateGroupChatMessageReplyDecrement, updateGroupChatReactionByChatId } from "@/store/slice/groupChatSlice";
import { useThreadReplies } from "@/components/rightPanel/useThreadReplies";
import { ThreadReplyBox } from "@/components/conversation/ThreadReplyBox";

// Module-level, so a selector that finds nothing returns the same value every
// time: a fresh [] or {} per call re-drew the thread on every store change.
const NO_ITEMS: never[] = []

export const GroupChatComments = () => {
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState)

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const groupChatState = useSelector((state: RootState) => state.groupChat.chatMessages[rightPanelState.data.groupUUID] || NO_ITEMS);

    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatComments[rightPanelState.data.chatMessageUUID] || NO_ITEMS);

    const pendingCommentReactionDeletes = useRef<Set<string>>(new Set())


    const chatInfo = useFetch<ChatInfoRes>(
        rightPanelState.data.groupUUID && rightPanelState.data.chatMessageUUID ? `${ChatGet.GetChatWithAllComments}/${rightPanelState.data.chatMessageUUID}` : "",
        undefined, undefined, OWN_ERRORS,
    )

    const dispatch = useDispatch()

    const post = usePost()
    const saveEdit = useSaveEdit()

    // The root from the conversation's loaded messages, live; else from the
    // thread's own answer. A link to an older message in a conversation already
    // in memory left the root out of the list, and the thread spun (FE-BUG-8).
    const chatInfoState = groupChatState.find(p => p.chat_uuid === rightPanelState.data.chatMessageUUID) ?? chatInfo.data?.data;



    // The server's replies, reconciled once per answer (useThreadReplies).
    useThreadReplies(chatInfo.data?.data?.chat_comments, chatInfo.lastRequestStartedAt, chatCommentState, (comments) =>
        dispatch(addChatComments({ chatId: rightPanelState.data.chatMessageUUID, comments })),
    )


    // The error first: a failed read has no data, which read as loading (TN-BUG-4).
    if (chatInfo.isError && !chatInfo.data?.data) {
        return (
            <div className="flex h-full flex-col bg-panel">
                <RightPanelHeader titleKey={'thread'}/>
                <ThreadLoadFailed error={chatInfo.isError} onRetry={() => void chatInfo.mutate()} retrying={chatInfo.isLoading} onClose={() => dispatch(closeRightPanel())}/>
            </div>
        )
    }

    if (!chatInfo.data?.data || !chatInfoState) {
        return <LoadingStateCircle />
    }


    const mainMessageData = getMainMessageData(chatInfoState)
    const forwardedMessageData = getForwardedMessageData(chatInfoState)
    const replyMessageData = getReplyMessageData(chatInfoState)


    // The message's own menu has asked already, in place (DeleteConfirm): no
    // dialog half a second later, and no toast once it's gone (SD-5).
    const handleDeletePost = (postId: string) => {
        if (postId) executeDeleteChat(postId)
    }

    const executeDeleteChat = (messageId: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChatMessage,
            payload: {
                chat_id: messageId
            },
            showErrorToast: true
        })
            .then(() => {
                const remaining = groupChatState.filter(m => m.chat_uuid !== messageId);
                const fallback = remaining.length > 0 ? remaining[remaining.length - 1] : null;

                dispatch(removeGroupChatByChatId({grpId: rightPanelState.data.groupUUID, messageId}))
                // Sync sidebar preview
                dispatch(RemoveMessageFromChatList({
                    grpId: rightPanelState.data.groupUUID,
                    messageId,
                    chatKey: rightPanelState.data.groupUUID,
                    fallbackMessage: fallback,
                }))
            })
            // A refusal is said by its request (usePost's toast), and the message
            // stays: it leaves only once the server has deleted it.
            .catch(() => {})

    }

    const handleDeleteChatComment = (commentUUID: string, commentIndex: number) => {
        if (commentUUID) executeDeleteChatComment(commentIndex, commentUUID)
    }


    const executeDeleteChatComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.RemoveChatComment,
            payload: {
                chat_id: rightPanelState.data.chatMessageUUID,
                comment_id: commentUUID,
            },
            showErrorToast: true
        })
            .then(() => {
                dispatch(removeChatComment({chatId: rightPanelState.data.chatMessageUUID, commentIndex}))
                dispatch(updateGroupChatMessageReplyDecrement({messageId: rightPanelState.data.chatMessageUUID, grpId: rightPanelState.data.groupUUID, comment: {comment_uuid: commentUUID, comment_text: '', comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))

            })
            // A refusal is said by its request (usePost's toast), and the message
            // stays: it leaves only once the server has deleted it.
            .catch(() => {})

    }

    const handleUpdateChatComment = (id: string, html: string) => saveEdit({ kind: "chatReply", chatMessageId: rightPanelState.data.chatMessageUUID, id }, html)

    // A correction to the thread's message or a reply saves as in the list:
    // at once, and back with the box open on what was typed when the save
    // fails (hooks/useSaveEdit, F-06). Both take the message's id first.
    const handleUpdateChat = (id: string, html: string) => saveEdit({ kind: "group", grpId: rightPanelState.data.groupUUID, id }, html)

    const createOrUpdateReaction = ( emojiId:string, reactionId:string)=> {

        post.makeRequest<CreateOrUpdateChatReaction, CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatReaction,
            payload :{
                chat_id: rightPanelState.data.chatMessageUUID,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateGroupChatReactionByChatId({grpId: rightPanelState.data.groupUUID, reactionId, emojiId, messageId: rightPanelState.data.chatMessageUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createGroupChatReactionChatId({grpId: rightPanelState.data.groupUUID, messageId: rightPanelState.data.chatMessageUUID, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeReaction = (reactionId:string) => {

        post.makeRequest<CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.RemoveChatReaction,
            payload :{
                chat_id: rightPanelState.data.chatMessageUUID,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{


                dispatch(removeGroupChatReactionByChatId({ grpId: rightPanelState.data.groupUUID, messageId: rightPanelState.data.chatMessageUUID, reactionId}))


            })
    }


    const createOrUpdateCommentReaction = (emojiId:string, reactionId:string, commentId:string, commentIdx: number) => {
        let tempId = ""
        let oldEmojiId = ""

        // Duplicate check
        if (!reactionId) {
            const hasReaction = chatCommentState[commentIdx]?.comment_reactions?.some(
                (r) =>
                    r.reaction_emoji_id === emojiId &&
                    r.reaction_added_by?.user_uuid === selfProfile.data?.data?.user_uuid
            )
            if (hasReaction) return
        }

        if (reactionId) {
             // Optimistic Update
            const reaction = chatCommentState[commentIdx]?.comment_reactions?.find((r) => r.uid === reactionId)
            oldEmojiId = reaction?.reaction_emoji_id || ""
            dispatch(updateChatCommentReaction({commentIndex: commentIdx, reactionId, emojiId, chatId:rightPanelState.data.chatMessageUUID}))

        } else if (selfProfile.data?.data) {
             // Optimistic Create
            tempId = `temp-${Date.now()}`
            dispatch(createChatCommentReaction({
                chatId:rightPanelState.data.chatMessageUUID,
                commentIndex: commentIdx,
                reactionId: tempId,
                emojiId,
                addedBy: selfProfile.data?.data
            }))
        }

        post.makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatCommentReaction,
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
                    dispatch(updateChatCommentReactionId({
                        chatId: rightPanelState.data.chatMessageUUID,
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
                        dispatch(updateChatCommentReaction({commentIndex: commentIdx, reactionId, emojiId: oldEmojiId, chatId:rightPanelState.data.chatMessageUUID}))
                    }
                } else {
                    dispatch(removeChatCommentReaction({commentIndex: commentIdx, reactionId: tempId, chatId:rightPanelState.data.chatMessageUUID}))
                }
            })
    }

    const removeCommentReaction = (reactionId:string, commentId: string, commentIdx: number) => {
         // Handle Race Condition
        if (reactionId.startsWith("temp-")) {
            pendingCommentReactionDeletes.current.add(reactionId)
            dispatch(removeChatCommentReaction({commentIndex: commentIdx, reactionId, chatId:rightPanelState.data.chatMessageUUID}))
            return
        }

        const reactionToRemove = chatCommentState[commentIdx]?.comment_reactions?.find((r) => r.uid === reactionId)

        dispatch(removeChatCommentReaction({commentIndex: commentIdx, reactionId, chatId:rightPanelState.data.chatMessageUUID}))

        post.makeRequest<CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.RemoveChatCommentReaction,
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
                    dispatch(createChatCommentReaction({
                        chatId:rightPanelState.data.chatMessageUUID,
                        commentIndex: commentIdx,
                        reactionId,
                        emojiId: reactionToRemove.reaction_emoji_id,
                        addedBy: reactionToRemove.reaction_added_by
                    }))
                }
            })
    }


    const threadKey = rightPanelState.data.postUUID || rightPanelState.data.chatMessageUUID
    return (
        // The thread panel (design v3 chat, C36): a layer of the sheet (the
        // task panel's darker step in dark). Its contents move, never the
        // column: x 16px to rest and a fade, 240 ms; another thread fades in.
        <div key={threadKey} data-right-panel-thread="" className="flex h-full flex-col bg-panel animate-panel-in">
            <RightPanelHeader titleKey={'thread'} subtitle="in this group" actions={<FollowThreadButton root={rightPanelState.data.chatMessageUUID} replies={mainMessageData.commentCount} />}/>

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
                updateMessage={handleUpdateChat}
                postUUID={rightPanelState.data.postUUID}
                isAdmin={selfProfile.data?.data.user_is_admin}
                getMediaUrl={GetEndpointUrl.GetGroupChatMedia + '/' + rightPanelState.data.groupUUID}
                attachments={mainMessageData.attachments}
            />

            {mainMessageData.commentCount > 0 && (

                <ReplyDivider replyCount={mainMessageData.commentCount} />


            )}

            {/* TL;DR for long threads — attributed root + replies, on-demand. */}
            {mainMessageData.commentCount >= 4 && (
                <div className="mx-4 mt-2">
                    <ThreadSummaryButton
                        getText={() =>
                            [
                                `${mainMessageData.userName || "Someone"}: ${mainMessageData.content}`,
                                ...chatCommentState.map(
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
                    comments={chatCommentState}
                    removeReaction={removeCommentReaction}
                    addOrUpdateReaction={createOrUpdateCommentReaction}
                    removeComment={handleDeleteChatComment}
                    updateComment={handleUpdateChatComment}
                    getMediaURL={GetEndpointUrl.GetGroupChatMedia + '/' + rightPanelState.data.groupUUID}

                />


            </div>
            {/* The reply box at the panel's foot, the composer at its compact size.
                A command typed here runs in the thread's conversation (FE-BUG-11). */}
            <ThreadReplyBox kind="group" conversation={rightPanelState.data.groupUUID} thread={rightPanelState.data.chatMessageUUID} />
        </div>
    )
}
