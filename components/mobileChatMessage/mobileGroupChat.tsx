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

import {usePost} from "@/hooks/usePost";
import {UserProfileInterface} from "@/types/user";
import {openUI} from "@/store/slice/uiSlice";
import {CreateUpdateCommentReqInterface} from "@/types/comment";
import {
    createGroupChatReactionChatId, removeGroupChatByChatId,
    removeGroupChatReactionByChatId, updateGroupChatByChatId, updateGroupChatMessageReplyDecrement,
    updateGroupChatReactionByChatId
} from "@/store/slice/groupChatSlice";
import {RemoveMessageFromChatList, UpdateMessageTextInChatList} from "@/store/slice/chatSlice";
import {app_chat_path, app_grp_chat_path} from "@/types/paths";
import {useRouter} from "next/navigation";

export const MobileGroupChat = ({ grpId, chatMessageUUID }: { grpId: string, chatMessageUUID: string }) => {

    const chatInfo = useFetch<ChatInfoRes>(
        grpId && chatMessageUUID ? `${GetEndpointUrl.GetChatWithAllComments}/${chatMessageUUID}` : "",
    )

    const router = useRouter();

    const post = usePost()
    const chatMessageState = useSelector((state: RootState) => state.groupChat.chatMessages[grpId] || []);

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

    if (chatInfo.isError  || !chatInfo.data?.data) {
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
                const remaining = chatMessageState.filter(m => m.chat_uuid !== messageId);
                const fallback = remaining.length > 0 ? remaining[remaining.length - 1] : null;

                dispatch(removeGroupChatByChatId({grpId, messageId}))
                // Sync sidebar preview
                dispatch(RemoveMessageFromChatList({
                    grpId: grpId,
                    messageId,
                    chatKey: grpId,
                    fallbackMessage: fallback,
                }))
                router.push(app_grp_chat_path + '/' + grpId);

            })

    }

    const handleUpdateChat = ( messageId: string, postHTMLText: string) => {

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.UpdateGroupChatMessage,
            payload: {
                chat_id: messageId,
                text_html: postHTMLText,
                grp_id: grpId
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateGroupChatByChatId({
                        grpId,
                        messageId,
                        htmlText: postHTMLText,
                    }))
                    // Sync sidebar preview
                    dispatch(UpdateMessageTextInChatList({
                        grpId: grpId,
                        messageId,
                        htmlText: postHTMLText,
                    }))
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
                dispatch(updateGroupChatMessageReplyDecrement({messageId: chatMessageUUID, grpId, comment: {comment_uuid: commentUUID, comment_text: '', comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))

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