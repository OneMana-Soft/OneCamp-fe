"use client"

import { memo, useCallback } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
    clearTaskCommentInputState,
    createNewTaskComment,
    createOrUpdateTaskCommentBody,
    type TaskCommentInputState,
} from "@/store/slice/createTaskCommentSlice"
import { usePost } from "@/hooks/usePost"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import type { CreateTaskCommentInterface } from "@/types/task"
import type { CreateCommentResInterface } from "@/types/comment"
import type { UserProfileInterface } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"
import { SendHorizontal } from "@/lib/icons"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { TaskCommentFileUpload } from "@/components/fileUpload/taskCommentFileUpload"
import type { Content } from "@tiptap/core"

interface TaskCommentComposerProps {
    taskUUID: string
    projectUUID: string
    commentBody?: string
    onChange: (content: Content) => void
    onSend: (latestContent?: string) => void
    onAttachmentClick: () => void
    onActionFiles?: (files: File[]) => void
    /** Files are attached and uploaded: Send reads as ready without text. */
    hasAttachments?: boolean
}

export const TaskCommentComposer = memo(function TaskCommentComposer({
    taskUUID,
    projectUUID,
    commentBody,
    onChange,
    onSend,
    onAttachmentClick,
    onActionFiles,
    hasAttachments = false,
}: TaskCommentComposerProps) {
    return (
        <div className="flex-shrink-0 border-t p-4">
            <MinimalTiptapTextInput
                throttleDelay={300}
                attachmentOnclick={onAttachmentClick}
                onActionFiles={onActionFiles}
                ButtonIcon={SendHorizontal}
                hasAttachments={hasAttachments}
                buttonOnclick={onSend}
                className={cn("max-w-full rounded-xl h-auto border p-2 bg-secondary/20")}
                editorContentClassName="overflow-auto"
                output="html"
                placeholder="Add a comment…"
                editable={true}
                toggleToolbar={true}
                editorClassName="focus:outline-none"
                onChange={onChange}
                content={commentBody}
            >
                <TaskCommentFileUpload taskUUID={taskUUID} projectUUID={projectUUID} />
            </MinimalTiptapTextInput>
        </div>
    )
})

/**
 * The composer with what it needs from the store: the comment being written,
 * its files, and sending it. It reads them itself, so the panel above it does
 * not: the panel read the draft, and every keystroke in a comment rendered the
 * whole panel again.
 */
export const TaskCommentBox = memo(function TaskCommentBox({
    taskUUID,
    projectUUID,
    onAttachmentClick,
    onActionFiles,
}: {
    taskUUID: string
    projectUUID: string
    onAttachmentClick: () => void
    onActionFiles?: (files: File[]) => void
}) {
    const dispatch = useDispatch()
    const post = usePost()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const commentState = useSelector(
        (state: RootState) => state.createTaskComment.taskCommentInputState[taskUUID] || (NO_DRAFT as TaskCommentInputState),
    )

    const onChange = useCallback(
        (content: Content) => {
            dispatch(createOrUpdateTaskCommentBody({ body: content?.toString() || "", taskUUID }))
        },
        [dispatch, taskUUID],
    )

    const onSend = useCallback(
        (latestContent?: string) => {
            const trimmedBody = removeEmptyPTags(latestContent ?? commentState?.commentBody)
            const files = commentState?.filesUploaded || []
            if ((!trimmedBody && files.length === 0) || post.isSubmitting) return
            post.makeRequest<CreateTaskCommentInterface, CreateCommentResInterface>({
                apiEndpoint: PostEndpointUrl.CreateTaskComment,
                payload: { task_comment_body: trimmedBody, task_uuid: taskUUID, task_comment_attachments: files },
            }).then((res) => {
                if (res && selfProfile.data?.data) {
                    dispatch(
                        createNewTaskComment({
                            commentBy: selfProfile.data.data,
                            taskId: taskUUID,
                            commentText: trimmedBody,
                            attachments: files,
                            commentId: res?.comment_id,
                            commentCreatedAt: res?.comment_created_at,
                        }),
                    )
                }
                dispatch(clearTaskCommentInputState({ taskUUID }))
            })
        },
        [commentState, taskUUID, post, dispatch, selfProfile.data?.data],
    )

    return (
        <TaskCommentComposer
            taskUUID={taskUUID}
            projectUUID={projectUUID}
            commentBody={commentState?.commentBody}
            hasAttachments={(commentState?.filesUploaded?.length ?? 0) > 0}
            onChange={onChange}
            onSend={onSend}
            onAttachmentClick={onAttachmentClick}
            onActionFiles={onActionFiles}
        />
    )
})

const NO_DRAFT = {}
