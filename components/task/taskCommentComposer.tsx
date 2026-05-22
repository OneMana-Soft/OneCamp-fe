"use client"

import { memo } from "react"
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
}

export const TaskCommentComposer = memo(function TaskCommentComposer({
    taskUUID,
    projectUUID,
    commentBody,
    onChange,
    onSend,
    onAttachmentClick,
    onActionFiles,
}: TaskCommentComposerProps) {
    return (
        <div className="flex-shrink-0 border-t p-4">
            <MinimalTiptapTextInput
                throttleDelay={300}
                attachmentOnclick={onAttachmentClick}
                onActionFiles={onActionFiles}
                ButtonIcon={SendHorizontal}
                buttonOnclick={onSend}
                className={cn("max-w-full rounded-xl h-auto border p-2 bg-secondary/20")}
                editorContentClassName="overflow-auto"
                output="html"
                placeholder="Add a message, if you'd like..."
                editable={true}
                toggleToolbar={true}
                editorClassName="focus:outline-none px-2 py-2"
                onChange={onChange}
                content={commentBody}
            >
                <TaskCommentFileUpload taskUUID={taskUUID} projectUUID={projectUUID} />
            </MinimalTiptapTextInput>
        </div>
    )
})
