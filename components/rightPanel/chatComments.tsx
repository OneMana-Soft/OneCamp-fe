import { displayNameOf } from "@/lib/personName"
import { THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import {useDispatch, useSelector} from "react-redux"
import type { RootState } from "@/store/store"

import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
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
import {RightPanelHeader} from "@/components/rightPanel/rightPanelHeader";
import {cn} from "@/lib/utils/helpers/cn";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {
    openUI,
} from "@/store/slice/uiSlice";
import { SendHorizontal } from "@/lib/icons";
import {usePost} from "@/hooks/usePost";
import {
    CreateCommentResInterface,
     CreateUpdateCommentReqInterface,
} from "@/types/comment";
import {useRef} from "react";
import {UserProfileInterface} from "@/types/user";


import {CreateOrUpdateChatReaction, CreateOrUpdateCommentReaction} from "@/types/reaction";
import {ChatInfoRes, CreateOrUpdateChatsReq} from "@/types/chat";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";
import {
    addChatComments,
    clearChatCommentInputState,
    createChatComment, createChatCommentReaction, createOrUpdateChatCommentBody,
    removeChatComment, removeChatCommentReaction,
    updateChatComment, updateChatCommentReaction, updateChatCommentReactionId
} from "@/store/slice/chatCommentSlice";
import {
    createChatReactionChatId,
    removeChatByChatId, removeChatReactionByChatId,
    updateChatByChatId, updateChatMessageReplyDecrement, updateChatMessageReplyIncrement, updateChatReactionByChatId,
    RemoveMessageFromChatList, UpdateMessageTextInChatList
} from "@/store/slice/chatSlice";
import {ChatCommentFileUpload} from "@/components/fileUpload/chatCommentFileUpload";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import {useUploadFile} from "@/hooks/useUploadFile";
import { useThreadReplies } from "@/components/rightPanel/useThreadReplies";

// Module-level, so a selector that finds nothing returns the same value every
// time: a fresh [] or {} per call re-drew the thread on every store change.
const NO_ITEMS: never[] = []
const NO_DRAFT = {}

export const ChatComments = () => {
    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState)

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const uploadFile = useUploadFile()

    const chatState = useSelector((state: RootState) => state.chat.chatMessages[rightPanelState.data.chatUUID] || NO_ITEMS);


    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatComments[rightPanelState.data.chatMessageUUID] || NO_ITEMS);

    const pendingCommentReactionDeletes = useRef<Set<string>>(new Set())

    // The reply being written: this thread's own draft, not the conversation's (MC-BUG-1).
    const chatCommentInputState = useSelector((state: RootState) => state.chatComments.chatCommentInputState[rightPanelState.data.chatMessageUUID] || NO_DRAFT);

    const chatInfo = useFetch<ChatInfoRes>(
        rightPanelState.data.chatUUID && rightPanelState.data.chatMessageUUID ? `${GetEndpointUrl.GetChatWithAllComments}/${rightPanelState.data.chatMessageUUID}` : "",
        undefined, undefined, OWN_ERRORS,
    )

    const dispatch = useDispatch()

    const post = usePost()

    // The root from the conversation's loaded messages, live; else from the
    // thread's own answer. A link to an older message in a conversation already
    // in memory left the root out of the list, and the thread spun (FE-BUG-8).
    const chatInfoState = chatState.find(p => p.chat_uuid === rightPanelState.data.chatMessageUUID) ?? chatInfo.data?.data


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

    if (chatInfo.isLoading || !chatInfo.data?.data || !chatInfoState) {
        return <LoadingStateCircle />
    }


    const mainMessageData = getMainMessageData(chatInfoState)
    const forwardedMessageData = getForwardedMessageData(chatInfoState)
    const replyMessageData = getReplyMessageData(chatInfoState)


    const handleDeletePost = (postId: string) => {

        if(!postId) return

        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Delete this message?",
                    description: "It's removed from the conversation for everyone. This can't be undone.",
                    confirmText: "Delete message",
                    destructive: true,
                    onConfirm: ()=>{executeDeleteChat(postId)}
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
                dispatch(removeChatByChatId({chatId: rightPanelState.data.chatUUID, messageId}))
                // Sync sidebar preview
                const selfUuid = selfProfile.data?.data?.user_uuid || ''
                if (selfUuid) {
                    dispatch(RemoveMessageFromChatList({
                        grpId: getGroupingId(rightPanelState.data.chatUUID, selfUuid),
                        messageId,
                        chatKey: rightPanelState.data.chatUUID,
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
                chat_id: rightPanelState.data.chatMessageUUID,
                comment_id: commentUUID,
            },
            showToast: true
        })
            .then(() => {
                dispatch(removeChatComment({chatId: rightPanelState.data.chatMessageUUID, commentIndex}))
                dispatch(updateChatMessageReplyDecrement({messageId: rightPanelState.data.chatMessageUUID, chatId: rightPanelState.data.chatUUID, comment: {comment_uuid: commentUUID, comment_text: '', comment_by: {user_uuid: '', user_name: '', user_profile_object_key: ''}, comment_created_at: new Date().toISOString()}}))

            })

    }

    const handleUpdateChatComment = ( commentUUID: string, commentHTMLText: string, commentIndex: number) => {

        const trimmedHtml = removeEmptyPTags(commentHTMLText)
        if (!trimmedHtml) return

        post.makeRequest<CreateUpdateCommentReqInterface>({
            apiEndpoint: PostEndpointUrl.UpdateChatComment,
            payload: {
                chat_id: rightPanelState.data.chatMessageUUID,
                comment_id: commentUUID,
                comment_text_html: trimmedHtml
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateChatComment({
                        commentIndex: commentIndex,
                        chatId: rightPanelState.data.chatMessageUUID,
                        htmlText: trimmedHtml,
                    }))
                }

            })
    }

    const handleUpdateChat = (postHTMLText: string, messageId: string) => {

        const trimmedHtml = removeEmptyPTags(postHTMLText)
        if (!trimmedHtml) return

        post.makeRequest<CreateOrUpdateChatsReq>({
            apiEndpoint: PostEndpointUrl.UpdateChatMessage,
            payload: {
                chat_id: messageId,
                text_html: trimmedHtml
            },
            showToast: true
        })
            .then((res)=>{

                if(res) {
                    dispatch(updateChatByChatId({
                        chatId: rightPanelState.data.chatUUID,
                        messageId,
                        htmlText: trimmedHtml,
                    }))
                    // Sync sidebar preview
                    const selfUuid = selfProfile.data?.data?.user_uuid || ''
                    if (selfUuid) {
                        dispatch(UpdateMessageTextInChatList({
                            grpId: getGroupingId(rightPanelState.data.chatUUID, selfUuid),
                            messageId,
                            htmlText: trimmedHtml,
                        }))
                    }
                }

            })
    }

    const handleSend = (latestContent?: string) => {
        // The thread this reply was written in, whichever is open when it lands.
        const threadId = rightPanelState.data.chatMessageUUID
        const files = chatCommentInputState.filesUploaded ?? []

        const rawBody = latestContent ?? chatCommentInputState.commentBody
        const body = removeEmptyPTags(rawBody)
        const hasAttachments = files.length > 0
        if (!body && !hasAttachments) return

        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreateChatComment,
            payload: {
                chat_id: threadId,
                comment_attachments: files,
                comment_text_html: body,
            }
        })
            .then((res)=>{

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChatComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: body, chatId: threadId, commentBy: selfProfile.data?.data, attachments: files}))
                     dispatch(updateChatMessageReplyIncrement({messageId: threadId, chatId: rightPanelState.data.chatUUID, comment: {comment_uuid: res?.comment_id || '', comment_created_at: res?.comment_created_at || new Date().toISOString(), comment_text: "", comment_by: selfProfile.data?.data || {user_uuid: '', user_name: '', user_profile_object_key: ''}}}))

                }

                // chatInfo.mutate()
                dispatch(clearChatCommentInputState({threadId, sent: files.map((f) => f.attachment_obj_key)}))


            })
    }

    const createOrUpdateReaction = ( emojiId:string, reactionId:string)=> {

        post.makeRequest<CreateOrUpdateChatReaction, CreateOrUpdateChatReaction>({apiEndpoint: PostEndpointUrl.CreateOrUpdateChatReaction,
            payload :{
                chat_id: rightPanelState.data.chatMessageUUID,
                reaction_emoji_id: emojiId,
                reaction_dgraph_id: reactionId
            }})
            .then((res)=>{


                if(reactionId) {
                    dispatch(updateChatReactionByChatId({chatId: rightPanelState.data.chatUUID, reactionId, emojiId, messageId: rightPanelState.data.chatMessageUUID}))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data){
                    dispatch(createChatReactionChatId({chatId: rightPanelState.data.chatUUID, messageId: rightPanelState.data.chatMessageUUID, reactionId: res?.reaction_dgraph_id, emojiId, addedBy: selfProfile.data?.data}))
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


                dispatch(removeChatReactionByChatId({ chatId: rightPanelState.data.chatUUID, messageId: rightPanelState.data.chatMessageUUID, reactionId}))


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
            <RightPanelHeader titleKey={'thread'} subtitle="in this conversation"/>

            <div className="pt-3" />
            <MessageContent
                root
                userInfo={mainMessageData.userInfo}
                createdAt={mainMessageData.createdAt}
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
                getMediaUrl={GetEndpointUrl.GetChatMedia + '/' + rightPanelState.data.chatUUID}
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
                    getMediaURL={GetEndpointUrl.GetChannelMedia + '/' + rightPanelState.data.channelUUID}

                />


            </div>
            {/* The reply box at the panel's foot, the composer at its compact size.
                A command typed here runs in the thread's conversation (FE-BUG-11). */}
            <div className="shrink-0 px-3 pb-3 pt-1" data-command-surface={rightPanelState.data.chatUUID}>
                <MinimalTiptapTextInput
                    throttleDelay={300}
                    attachmentOnclick = {()=>{
                        dispatch(openUI({ key: 'chatCommentFileUpload' }))}
                    }
                    onActionFiles={async (files) => {
                        if (!files?.length) return;
                        const grpId = getGroupingId(rightPanelState.data.chatUUID, selfProfile.data?.data.user_uuid || '')
                        await uploadFile.makeRequestToUploadToChatComment(files as unknown as FileList, rightPanelState.data.chatMessageUUID, grpId);
                    }}
                    ButtonIcon={SendHorizontal}
                    hasAttachments={(chatCommentInputState.filesUploaded?.length ?? 0) > 0}
                    buttonOnclick={handleSend}
                    variant="chat"
                    compact
                    output="html"
                    placeholder={THREAD_COMPOSER_PLACEHOLDER}
                    editable={true}
                    editorClassName="focus:outline-none"
                    onChange={(content ) => {
                        dispatch(createOrUpdateChatCommentBody({threadId: rightPanelState.data.chatMessageUUID, body: content as string}))
                    }}
                    content={chatCommentInputState?.commentBody || null}
                >
                    <ChatCommentFileUpload chatUUID={rightPanelState.data.chatUUID} chatMessageUUID={rightPanelState.data.chatMessageUUID}/>

                </MinimalTiptapTextInput>
            </div>
        </div>
    )
}
