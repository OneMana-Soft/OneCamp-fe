"use client"

import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import type { CreateDocCommentInterface, DocInfoResponse } from "@/types/doc"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useDispatch, useSelector } from "react-redux"
import { useCallback, useEffect, useState } from "react"
import type { UserProfileInterface } from "@/types/user"
import type { RootState } from "@/store/store"
import type { CommentInfoInterface, CreateCommentResInterface } from "@/types/comment"
import {
    addDocComments,
    clearDocCommentInputState,
    createDocCommentReaction,
    createNewDocComment,
    createOrUpdateDocCommentBody,
    removeDocComment,
    removeDocCommentReaction,
    updateDocComment,
    updateDocCommentReaction,
} from "@/store/slice/createDocCommentSlice"
import {
    selectDocCommentInputState,
    selectDocComments,
} from "@/store/selectors/createDocCommentSelectors"
import { RightPanelHeader } from "@/components/rightPanel/rightPanelHeader"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { openUI } from "@/store/slice/uiSlice"
import { SendHorizontal } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { DocCommentFileUpload } from "@/components/fileUpload/docCommentFileUpload"
import type { Content } from "@tiptap/core"
import { CommentsList } from "@/components/rightPanel/commentsList"
import { usePost } from "@/hooks/usePost"
import type { CreateOrUpdateCommentReaction } from "@/types/reaction"
import {useMedia} from "@/context/MediaQueryContext";
import {Separator} from "@/components/ui/separator";
import {useUploadFile} from "@/hooks/useUploadFile";

export const DocCommentList = ({ docId }: { docId: string }) => {
    const dispatch = useDispatch()
    const post = usePost()
    const uploadFile = useUploadFile()
    const docCommentList = useFetch<DocInfoResponse>(docId ? GetEndpointUrl.GetAllCommentOfDoc + "/" + docId : "")
    const [allowedToComment, setAllowedToComment] = useState<boolean>(false)

    const { isMobile, isDesktop } = useMedia()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const commentState = useSelector((state: RootState) =>
        selectDocCommentInputState(state, docId),
    )

    const docCommentState = useSelector((state: RootState) =>
        selectDocComments(state, docId),
    )

    useEffect(() => {
        if (docCommentList.data?.data && selfProfile.data?.data) {
            dispatch(addDocComments({ docId: docId, comments: docCommentList.data?.data.doc_comments || [] }))

            if (
                docCommentList.data?.data.doc_comment_access ||
                docCommentList.data?.data.doc_edit_access ||
                docCommentList.data?.data.doc_public_comment ||
                selfProfile.data?.data.user_uuid == docCommentList.data?.data.doc_created_by.user_uuid
            ) {
                setAllowedToComment(true)
            }
        }
    }, [docCommentList.data?.data, selfProfile.data?.data])

    const handleCommentBodyChange = useCallback(
        (content: Content) => {
            dispatch(
                createOrUpdateDocCommentBody({
                    body: content?.toString() || "",
                    docUUID: docId,
                }),
            )
        },
        [dispatch, docId],
    )

    const removeCommentReaction = (reactionId: string, commentId: string, commentIdx: number) => {
        post
            .makeRequest<CreateOrUpdateCommentReaction>({
                apiEndpoint: PostEndpointUrl.RemoveDocCommentReaction,
                payload: {
                    comment_id: commentId,
                    reaction_dgraph_id: reactionId,
                },
            })
            .then(() => {
                dispatch(removeDocCommentReaction({ commentIndex: commentIdx, reactionId, docId: docId }))
            })
    }

    const executeDeleteDocComment = (commentIndex: number, commentUUID: string) => {
        post
            .makeRequest<CreateDocCommentInterface>({
                apiEndpoint: PostEndpointUrl.RemoveDocComment,
                payload: {
                    doc_uuid: docId,
                    doc_comment_uuid: commentUUID,
                },
                showToast: true,
            })
            .then(() => {
                dispatch(removeDocComment({ docId: docId, commentIndex }))
                // dispatch(updateTaskMessageReplyDecrement({messageId: rightPanelState.data.chatMessageUUID, chatId: rightPanelState.data.chatUUID, comment: {comment_uuid: commentUUID, comment_text: ''}}))
            })
    }

    const handleUpdateDocComment = (commentUUID: string, commentHTMLText: string, commentIndex: number) => {
        post
            .makeRequest<CreateDocCommentInterface>({
                apiEndpoint: PostEndpointUrl.UpdateDocComment,
                payload: {
                    doc_comment_uuid: commentUUID,
                    doc_comment_body: commentHTMLText,
                },
                showToast: true,
            })
            .then((res) => {
                if (res) {
                    dispatch(
                        updateDocComment({
                            commentIndex: commentIndex,
                            docId: docId,
                            htmlText: commentHTMLText,
                        }),
                    )
                }
            })
    }

    const handleDeleteDocComment = (commentUUID: string, commentIndex: number) => {
        if (!commentUUID) return

        setTimeout(() => {
            dispatch(
                openUI({
                    key: "confirmAlert",
                    data: {
                        title: "Deleting comment",
                        description: "Are you sure you want to proceed deleting the comment",
                        confirmText: "Delete post",
                        onConfirm: () => {
                            executeDeleteDocComment(commentIndex, commentUUID)
                        },
                    },
                }),
            )
        }, 500)
    }

    const createOrUpdateCommentReaction = (
        emojiId: string,
        reactionId: string,
        commentId: string,
        commentIdx: number,
    ) => {
        post
            .makeRequest<CreateOrUpdateCommentReaction, CreateOrUpdateCommentReaction>({
                apiEndpoint: PostEndpointUrl.CreateOrUpdateDocCommentReaction,
                payload: {
                    comment_id: commentId,
                    reaction_emoji_id: emojiId,
                    reaction_dgraph_id: reactionId,
                },
            })
            .then((res) => {
                if (reactionId) {
                    dispatch(updateDocCommentReaction({ commentIndex: commentIdx, reactionId, emojiId, docId: docId }))
                } else if (res?.reaction_dgraph_id && selfProfile.data?.data) {
                    dispatch(
                        createDocCommentReaction({
                            docId: docId,
                            commentIndex: commentIdx,
                            reactionId: res?.reaction_dgraph_id,
                            emojiId,
                            addedBy: selfProfile.data?.data,
                        }),
                    )
                }
            })
    }

    const createComment = useCallback(() => {
        const commentBody = commentState?.commentBody
        if (!commentBody?.trim() || post.isSubmitting) return

        post
            .makeRequest<CreateDocCommentInterface, CreateCommentResInterface>({
                apiEndpoint: PostEndpointUrl.CreateDocComment,
                payload: {
                    doc_comment_body: commentBody,
                    doc_uuid: docId,
                    doc_comment_attachments: commentState?.filesUploaded || [],
                },
            })
            .then((res) => {
                if (res && selfProfile.data?.data) {
                    dispatch(
                        createNewDocComment({
                            commentBy: selfProfile.data?.data,
                            docId: docId,
                            commentText: commentBody,
                            attachments: commentState?.filesUploaded || [],
                            commentId: res?.comment_id,
                            commentCreatedAt: res?.comment_created_at,
                        }),
                    )
                }

                dispatch(clearDocCommentInputState({ docUUID: docId }))
            })
    }, [commentState, docId, post, dispatch])

    return (
        <div className="flex flex-col h-full ">
            { isDesktop && <>
                <RightPanelHeader titleKey={"docComment"} />
                <Separator orientation="horizontal" />
            </>
            }

            <div className="flex-1 p-4 overflow-y-auto">
                {docCommentState.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center text-muted-foreground px-4">
                        <p>No comments yet. Be the first to add one!</p>
                    </div>
                ) : (
                    <CommentsList
                        comments={docCommentState}
                        removeReaction={removeCommentReaction}
                        addOrUpdateReaction={createOrUpdateCommentReaction}
                        removeComment={handleDeleteDocComment}
                        updateComment={handleUpdateDocComment}
                        getMediaURL={`${GetEndpointUrl.GetDocMedia}/${docId}`}
                    />
                )}
            </div>

            {allowedToComment && (
                <div className="flex-shrink-0 border-t p-4">
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        attachmentOnclick={() => dispatch(openUI({ key: 'docCommentFileUpload' }))}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            await uploadFile.makeRequestToUploadToDocComment(files as unknown as FileList, docId);
                        }}
                        ButtonIcon={SendHorizontal}
                        buttonOnclick={createComment}
                        className={cn("max-w-full rounded-xl h-auto border p-2 bg-secondary/20")}
                        editorContentClassName="overflow-auto"
                        output="html"
                        placeholder="Add a message, if you'd like..."
                        editable={true}
                        toggleToolbar={true}
                        editorClassName="focus:outline-none px-2 py-2"
                        onChange={handleCommentBodyChange}
                        content={commentState?.commentBody}
                    >
                        <DocCommentFileUpload docUUID={docId} />
                    </MinimalTiptapTextInput>
                </div>
            )}
        </div>
    )
}
