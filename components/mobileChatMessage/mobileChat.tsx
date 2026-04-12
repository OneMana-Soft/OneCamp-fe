"use client"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useDispatch, useSelector} from "react-redux";
import {
    CreateOrUpdateChatReaction, CreateOrUpdateCommentReaction,

} from "@/types/reaction";
import {MobileMessage} from "@/components/mobileMessage/mobileMessage";
import {getForwardedMessageData, getMainMessageData} from "@/lib/utils/rightPanelHelper";
import {MobileMessageCommentList} from "@/components/mobileMessage/mobileMessageCommentList";
import {ReplyDivider} from "@/components/rightPanel/replyDivider";
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {ErrorState} from "@/components/error/errorState";
import {ChatInfoRes, CreateOrUpdateChatsReq} from "@/types/chat";
import type {RootState} from "@/store/store";
import {useEffect} from "react";
import {
    addChatComments,
    createChatCommentReaction, removeChatComment,
    removeChatCommentReaction, updateChatComment,
    updateChatCommentReaction
} from "@/store/slice/chatCommentSlice";
import {
    createChatReactionChatId, removeChatByChatId,
    removeChatReactionByChatId, updateChatByChatId, updateChatMessageReplyDecrement,
    updateChatReactionByChatId,
    RemoveMessageFromChatList, UpdateMessageTextInChatList
} from "@/store/slice/chatSlice";
import {usePost} from "@/hooks/usePost";
import {UserProfileInterface} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {CreateUpdateCommentReqInterface} from "@/types/comment";
import {getGroupingId} from "@/lib/utils/getGroupingId";

export const MobileChat = ({ chatId, chatMessageUUID }: { chatId: string, chatMessageUUID: string }) => {

    const chatInfo = useFetch<ChatInfoRes>(
        chatId && chatMessageUUID ? `${GetEndpointUrl.GetChatWithAllComments}/${chatMessageUUID}` : "",
    )

    const post = usePost()
    const chatMessageState = useSelector((state: RootState) => state.chat.chatMessages[chatId] || []);

    const chatState = chatMessageState?.find(c => c.chat_uuid === chatMessageUUID);

    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatComments[chatMessageUUID] || []);

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const dispatch = useDispatch()
    const handleRetry = () => {
        // Trigger refetch - this would depend on your useFetch implementation
        window.location.reload()
    }

    useEffect(() => {

        if(chatInfo.data?.data && chatInfo.data.data.chat_comments && chatCommentState.length != chatInfo.data.data.chat_comments.length) {
            dispatch(addChatComments({chatId: chatMessageUUID, comments:chatInfo.data.data.chat_comments}))
        }



    }, [chatInfo.data?.data, chatCommentState.length, chatMessageUUID, dispatch]);

    if (chatInfo.isLoading|| !chatState ) {
        return <LoadingStateCircle />
    }

    if (chatInfo.isError ) {
        return <ErrorState onRetry={handleRetry}  errorMessage={'failed to fetch the thread'} errorTitle={'Thread not found'}/>
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
                    dispatch(updateChatReactionByChatId({chatId: chatId, reactionId, emojiId, messageId: chatMessageUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createChatReactionChatId({chatId: chatId, messageId: chatMessageUUID, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
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


                dispatch(removeChatReactionByChatId({ chatId: chatId, messageId: chatMessageUUID, reactionId}))


            })
    }


    const handleDeleteChat = (messaageId: string) => {

        if(!messaageId) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting post",
                    description: "Are you sure you want to proceed deleting the chat",
                    confirmText: "Delete chat",
                    onConfirm: ()=>{executeDeleteChat(messaageId)}
                }
            }));
        }, 500);


    }

    const executeDeleteChat = (messageId: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.DeleteChatMessage,
            payload: {
                chat_id: messageId
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeChatByChatId({chatId: chatId, messageId}))
                // Sync sidebar preview
                const selfUuid = selfProfile.data?.data?.user_uuid || ''
                if (selfUuid) {
                    dispatch(RemoveMessageFromChatList({
                        grpId: getGroupingId(chatId, selfUuid),
                        messageId,
                        chatKey: chatId,
                    }))
                }
            })

    }

    const handleUpdateChat = ( messageId: string, postHTMLText: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.UpdateChatMessage,
            payload: {
                chat_id: messageId,
                text_html: postHTMLText
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateChatByChatId({
                        chatId: chatId,
                        messageId,
                        htmlText: postHTMLText,
                    }))
                    // Sync sidebar preview
                    const selfUuid = selfProfile.data?.data?.user_uuid || ''
                    if (selfUuid) {
                        dispatch(UpdateMessageTextInChatList({
                            grpId: getGroupingId(chatId, selfUuid),
                            messageId,
                            htmlText: postHTMLText,
                        }))
                    }
                }

            })
    }

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

    const handleUpdateChatComment = ( commentUUID: string, commentHTMLText: string, commentIndex: number) => {

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.UpdateChatComment,
            payload: {
                chat_id: chatMessageUUID,
                comment_id: commentUUID,
                comment_text_html: commentHTMLText
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateChatComment({
                        commentIndex: commentIndex,
                        chatId: chatMessageUUID,
                        htmlText: commentHTMLText,
                    }))
                }

            })
    }

    const handleDeleteChatComment = (commentUUID: string, commentIndex: number) => {

        if(!commentUUID) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting chat",
                    description: "Are you sure you want to proceed deleting the chat comment",
                    confirmText: "Delete chat comment",
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
                dispatch(updateChatMessageReplyDecrement({messageId: chatMessageUUID, chatId: chatId, comment: {comment_uuid: commentUUID, comment_text: '', comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))

            })

    }


    const mainMessageData = getMainMessageData(chatState)
    const forwardedMessageData = getForwardedMessageData(chatState)




    return (
            <div style={{height: window.innerHeight - 190}} className='overflow-y-auto'>
                <div className='pb-4'>

                <MobileMessage
                    userInfo={mainMessageData.userInfo}
                    createdAt={mainMessageData.createdAt}
                    content={mainMessageData.content}
                    forwardedMessage={forwardedMessageData}
                    chatUUID={chatId}
                    chatMessageUUID={chatMessageUUID}
                    getMediaUrl={GetEndpointUrl.GetChatMedia + '/' + chatId}
                    rawReactions={mainMessageData.reactions}
                    addReaction={createOrUpdateReaction}
                    removeReaction={removeReaction}
                    deleteMessage={handleDeleteChat}
                    updateMessage={handleUpdateChat}
                    attachments={mainMessageData.attachments}
                />
                </div>

                <ReplyDivider replyCount={mainMessageData.commentCount}/>

                    <MobileMessageCommentList
                        comments={chatCommentState}
                        getMediaURL={GetEndpointUrl.GetChatMedia + '/' + chatId}
                        addReaction={createOrUpdateCommentReaction}
                        removeReaction={removeCommentReaction}
                        updateMessage={handleUpdateChatComment}
                        deleteMessage={handleDeleteChatComment}
                        chatUUID={chatId}
                        chatMessageUUID={chatMessageUUID}
                    />

            </div>

    )
}