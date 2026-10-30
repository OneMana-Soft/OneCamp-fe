"use client"

import { memo, useCallback, useRef } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
    clearTaskCommentInputState,
    createNewTaskComment,
    createOrUpdateTaskCommentBody,
    type TaskCommentInputState,
} from "@/store/slice/createTaskCommentSlice"
import { usePost } from "@/hooks/usePost"
import { usePhone } from "@/hooks/usePhone"
import { fromFoot, useRootPlace } from "@/components/livekit/rootPlace"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags"
import type { CreateTaskCommentInterface } from "@/types/task"
import type { CreateCommentResInterface } from "@/types/comment"
import type { UserProfileInterface } from "@/types/user"
import { cn } from "@/lib/utils/helpers/cn"
import { Eye, SendHorizontal, WifiOff } from "@/lib/icons"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { TaskCommentFileUpload } from "@/components/fileUpload/taskCommentFileUpload"
import type { Content } from "@tiptap/core"

const nowhere = { current: null }

// On a phone the box owns the screen's foot: it publishes its top as a
// composer sheet does, so toasts and the connection pill sit above it.
function usePhoneFoot() {
    const ref = useRef<HTMLDivElement>(null)
    const phone = usePhone()
    useRootPlace("--mobile-drawer-h", phone ? ref : nowhere, fromFoot, phone)
    return ref
}

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
    /**
     * The page's columns, on a task's own page: the box sits under the work
     * column, where the comments are, instead of across the whole sheet
     * (PTC-45: 264 to 1416 px under a column from 332 to 968).
     */
    frame?: string
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
    frame,
}: TaskCommentComposerProps) {
    const foot = usePhoneFoot()
    return (
        // Tighter on a phone: clear of the home indicator, less empty box.
        <div ref={foot} data-task-comment-box="" className="flex-shrink-0 border-t px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-4">
            <div data-composer-frame={frame ? "page" : undefined} className={frame}>
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
        </div>
    )
})

/**
 * In the box's place for a project's viewer, who can't comment: said quietly,
 * never a box that refuses what is typed (Work Access, A1). later: a task made
 * on this device whose project's access it doesn't hold (lib/work/access
 * accessHeldBack): it can be changed once back online, so it never says
 * view-only.
 */
export function TaskCommentNote({ frame, later }: { frame?: string; later?: boolean }) {
    const foot = usePhoneFoot()
    return (
        <div ref={foot} data-task-comment-note="" className="flex-shrink-0 border-t px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4">
            <p data-composer-frame={frame ? "page" : undefined} className={cn("flex items-center gap-2 text-ui-sm text-ink-3", frame)}>
                {later ? <WifiOff className="size-3.5 shrink-0" aria-hidden="true" /> : <Eye className="size-3.5 shrink-0" aria-hidden="true" />}
                <span data-task-comment-later={later ? "" : undefined}>
                    {later ? "You can change and comment on it when you're back online." : "You can see this project but not comment in it."}
                </span>
            </p>
        </div>
    )
}

/**
 * The composer with the draft, its files and sending it, read here so a
 * keystroke doesn't render the whole panel above it again.
 */
export const TaskCommentBox = memo(function TaskCommentBox({
    taskUUID,
    projectUUID,
    onAttachmentClick,
    onActionFiles,
    frame,
}: {
    taskUUID: string
    projectUUID: string
    onAttachmentClick: () => void
    onActionFiles?: (files: File[]) => void
    /** The page's columns, on a task's own page (TaskCommentComposer). */
    frame?: string
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
            frame={frame}
        />
    )
})

const NO_DRAFT = {}
