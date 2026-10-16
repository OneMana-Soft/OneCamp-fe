"use client"

import { displayNameOf } from "@/lib/personName"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {
    CreateOrUpdateChatReaction, CreateOrUpdateCommentReaction,

} from "@/types/reaction";
import {MobileMessage} from "@/components/mobileMessage/mobileMessage";
import {getForwardedMessageData, getMainMessageData, getReplyMessageData} from "@/lib/utils/rightPanelHelper";
import {MobileMessageCommentList} from "@/components/mobileMessage/mobileMessageCommentList";
import {ReplyDivider} from "@/components/rightPanel/replyDivider";
import {ThreadSummaryButton} from "@/components/ai/ThreadSummaryButton";
import {ThreadLoadFailed} from "@/components/rightPanel/threadLoadFailed";
import {OWN_ERRORS} from "@/lib/axiosInstance";
import {ChatInfoRes} from "@/types/chat";
import type {RootState} from "@/store/store";
import {
    addChatComments,
    createChatCommentReaction, removeChatComment,
    removeChatCommentReaction, updateChatCommentReaction
} from "@/store/slice/chatCommentSlice";

import {usePost} from "@/hooks/usePost";
import { useSaveEdit } from "@/hooks/useSaveEdit"
import { useDeleteMessage } from "@/hooks/useDeleteMessage";
import {UserProfileInterface} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {CreateUpdateCommentReqInterface} from "@/types/comment";
import {
    createGroupChatReactionChatId,
    removeGroupChatReactionByChatId, updateGroupChatMessageReplyDecrement,
    updateGroupChatReactionByChatId
} from "@/store/slice/groupChatSlice";
import {app_grp_chat_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useThreadReplies } from "@/components/rightPanel/useThreadReplies";

// Module-level, so a selector that finds nothing returns the same value every
// time: a fresh [] per call re-drew the thread on every store change.
const NO_ITEMS: never[] = []

export const MobileGroupChat = ({ grpId, chatMessageUUID }: { grpId: string, chatMessageUUID: string }) => {

    const chatInfo = useFetch<ChatInfoRes>(
        grpId && chatMessageUUID ? `${GetEndpointUrl.GetChatWithAllComments}/${chatMessageUUID}` : "",
        undefined, undefined, OWN_ERRORS,
    )

    const router = useRouter();

    const post = usePost()
    const saveEdit = useSaveEdit()
    const deleteMessage = useDeleteMessage()
    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || NO_ITEMS);

    const chatState = chatMessageState?.find(c => c.chat_uuid === chatMessageUUID);

    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatComments[chatMessageUUID] || NO_ITEMS);

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const dispatch = useDispatch()

    // The server's replies, reconciled once per answer (useThreadReplies).
    useThreadReplies(chatInfo.data?.data?.chat_comments, chatInfo.lastRequestStartedAt, chatCommentState, (comments) =>
        dispatch(addChatComments({ chatId: chatMessageUUID, comments })),
    )

    // The error first: a failed read has no data, which read as loading (TN-BUG-4).
    if (chatInfo.isError && !chatInfo.data?.data) {
        return <ThreadLoadFailed error={chatInfo.isError} onRetry={() => void chatInfo.mutate()} retrying={chatInfo.isLoading}/>
    }

    if (chatInfo.isLoading|| !chatState || !chatInfo.data?.data) {
        return <div role="status" aria-label="Loading comments"><SkeletonRows rows={4} lines={2} /></div>
    }


    const createOrUpdateReaction = ( emojiId:string, reactionId:string)=> {

        post.makeRequest<CreateOrUpdateChatReaction, CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatReaction,
            payload :{
                chat_id: chatMessageUUID
                ,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateGroupChatReactionByChatId({grpId: grpId, reactionId, emojiId, messageId: chatMessageUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createGroupChatReactionChatId({grpId: grpId, messageId: chatMessageUUID, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeReaction = (reactionId:string) => {

        post.makeRequest<CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.RemoveChatReaction,
            payload :{
                chat_id: chatMessageUUID,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{


                dispatch(removeGroupChatReactionByChatId({ grpId, messageId: chatMessageUUID, reactionId}))


            })
    }


    const handleDeleteChat = (messaageId: string) => {

        if(!messaageId) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Delete this message?",
                    description: "It's removed from the conversation for everyone. This can't be undone.",
                    confirmText: "Delete message",
                    destructive: true,
                    onConfirm: ()=>{executeDeleteChat(messaageId)}
                }
            }));
        }, 500);


    }

    // The thread's message leaves at once, and the page goes back to the
    // group, which shows the delete or, if refused, the message put back
    // (QA F-02).
    const executeDeleteChat = (messageId: string) => {
        void deleteMessage({ kind: "group", grpId, id: messageId })
        router.replace(app_grp_chat_path + '/' + grpId);
    }

    // A correction to the thread's message or a reply saves as in the list:
    // at once, and back with the box open on what was typed when the save
    // fails (hooks/useSaveEdit, F-06). Both take the message's id first.
    const handleUpdateChat = (id: string, html: string) => saveEdit({ kind: "group", grpId, id }, html)

    const createOrUpdateCommentReaction = (emojiId:string, reactionId:string, commentId:string, commentIdx: number) => {
        post.makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateChatCommentReaction({commentIndex: commentIdx, reactionId, emojiId, chatId:chatMessageUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createChatCommentReaction({chatId:chatMessageUUID, commentIndex: commentIdx, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
                }
            })
    }

    const removeCommentReaction = (reactionId:string, commentId: string, commentIdx: number) => {

        post.makeRequest<CreateOrUpdateCommentReaction>({apiEndpoint: PostEndpointUrl.RemoveChatCommentReaction,
            payload :{
                comment_id: commentId,
                reaction_dgraph_id: reactionId
            }})
            .then(()=>{


                dispatch(removeChatCommentReaction({commentIndex: commentIdx, reactionId, chatId:chatMessageUUID}))

            })
    }

    const handleUpdateChatComment = (id: string, html: string) => saveEdit({ kind: "chatReply", chatMessageId: chatMessageUUID, id }, html)

    const handleDeleteChatComment = (commentUUID: string, commentIndex: number) => {

        if(!commentUUID) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Delete this reply?",
                    description: "It's removed from the thread for everyone. This can't be undone.",
                    confirmText: "Delete reply",
                    destructive: true,
                    onConfirm: ()=>{executeDeleteChatComment(commentIndex, commentUUID)}
                }
            }));
        }, 500);


    }


    const executeDeleteChatComment = ( commentIndex: number, commentUUID: string) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.RemoveChatComment,
            payload: {
                chat_id: chatMessageUUID,
                comment_id: commentUUID,
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeChatComment({chatId: chatMessageUUID, commentIndex}))
                dispatch(updateGroupChatMessageReplyDecrement({messageId: chatMessageUUID, grpId, comment: {comment_uuid: commentUUID, comment_text: '', comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))

            })

    }


    const mainMessageData = getMainMessageData(chatState)
    const forwardedMessageData = getForwardedMessageData(chatState)
    const replyMessageData = getReplyMessageData(chatState)




    return (
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className='pb-4'>

                <MobileMessage
                    userInfo={mainMessageData.userInfo}
                    createdAt={mainMessageData.createdAt}
                    content={mainMessageData.content}
                    forwardedMessage={forwardedMessageData}
                    replyMessage={replyMessageData}
                    grpId={grpId}
                    chatMessageUUID={chatMessageUUID}
                    getMediaUrl={GetEndpointUrl.GetGroupChatMedia + '/' + grpId}
                    rawReactions={mainMessageData.reactions}
                    addReaction={createOrUpdateReaction}
                    removeReaction={removeReaction}
                    deleteMessage={handleDeleteChat}
                    updateMessage={handleUpdateChat}
                    attachments={mainMessageData.attachments}
                />
                </div>

                <ReplyDivider replyCount={mainMessageData.commentCount}/>

                {/* TL;DR for long threads — parity with the desktop right panel. */}
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

                    <MobileMessageCommentList
                        comments={chatCommentState}
                        getMediaURL={GetEndpointUrl.GetGroupChatMedia + '/' + grpId}
                        addReaction={createOrUpdateCommentReaction}
                        removeReaction={removeCommentReaction}
                        updateMessage={handleUpdateChatComment}
                        deleteMessage={handleDeleteChatComment}
                        groupUUID={grpId}
                        chatMessageUUID={chatMessageUUID}
                    />

            </div>

    )
}