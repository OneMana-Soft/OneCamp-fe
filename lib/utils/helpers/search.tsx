"use client"

import React, { memo } from "react"
import { Search, MessageSquare, FileText, Paperclip, CheckSquare, MessageCircle, User, FolderKanban, Hash } from "lucide-react"
import { SearchResult } from "@/services/searchService"
import { ChatUserAvatar } from "@/components/chat/chatUserAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { isRenderable } from "@/lib/utils/validation/isRenderable"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { AttachmentMediaReq } from "@/types/attachment"
import { sanitizePlainHtml } from "@/lib/sanitizeHtml"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"

export const HighlightedText = memo(({ text, highlights, field }: { text: string, highlights?: any, field: string }) => {
    if (!highlights || !highlights[field]) return <span>{text}</span>
    const highlight = highlights[field][0]
    // OpenSearch highlights wrap matched terms with <em>...</em>, but
    // the surrounding content is the user-authored body — sanitise so
    // a hostile message body cannot inject tags via the search-result
    // panel. SafeHtml defers sanitization to the client to keep the
    // server rendering JSDOM-free.
    return <SafeHtml as="span" html={highlight} sanitizer={sanitizePlainHtml} />
})
HighlightedText.displayName = "HighlightedText"

export const getTitle = (result: SearchResult): string => {
    switch (result.type) {
        case "chat": return result.chat?.chat_body || ""
        case "post": return result.post?.post_body || ""
        case "doc": return result.doc?.doc_title || ""
        case "task": return result.task?.task_name || ""
        case "comment": return result.comment?.comment_body || ""
        case "attachment": return result.attachment?.attachment_file_name || ""
        case "user": return result.user?.user_name || ""
        case "project": return result.project?.project_name || ""
        case "channel": return result.channel?.ch_name || ""
        case "team": return result.team?.team_name || ""
        default: return ""
    }
}

export const getContext = (result: SearchResult): string => {
    switch (result.type) {
        case "chat": return `Chat message`
        case "post": return `Post in ${result.post?.post_ch_name}`
        case "doc": return `Document by ${result.doc?.doc_created_by_user_full_name}`
        case "task": return `Task assigned to ${result.task?.task_assignee_user_full_name}`
        case "comment":
            if (result.comment?.comment_doc_id) return `Comment on doc ${result.comment?.comment_doc_title}`
            return `Comment by ${result.comment?.comment_by_user_full_name}`
        case "attachment":
            if (result.attachment?.attachment_doc_id) return `Attachment in doc ${result.attachment?.attachment_doc_title}`
            return `Attachment in ${result.attachment?.attachment_channel_name || "Chat"}`
        case "user": return result.user?.user_email || `User profile`
        case "project": return `Project`
        case "channel": return `Channel`
        case "team": return `Team`
        default: return ""
    }
}

export const getIcon = (result: SearchResult, iconClassName = "h-4 w-4") => {
    if (result.type === "user") {
        return (
            <ChatUserAvatar
                userProfileObjKey={result.user?.user_profile_object_key}
                userName={result.user?.user_name}
            />
        )
    }

    switch (result.type) {
        case "chat": return <MessageCircle className={iconClassName} />
        case "post": return <MessageSquare className={iconClassName} />
        case "doc": return <FileText className={iconClassName} />
        case "task": return <CheckSquare className={iconClassName} />
        case "comment": return <MessageCircle className={cn(iconClassName, "opacity-70")} />
        case "attachment": return <Paperclip className={iconClassName} />
        case "project": return <FolderKanban className={iconClassName} />
        case "channel": return <Hash className={iconClassName} />
        case "team": return <User className={cn(iconClassName, "text-primary")} />
        default: return <Search className={iconClassName} />
    }
}

export const getHighlightedTitle = (result: SearchResult) => {
    const title = getTitle(result)
    if (!result.highlight) return <span>{title}</span>

    const fieldMap: Record<string, string> = {
        chat: 'chat_body',
        post: 'post_body',
        comment: 'comment_body',
        attachment: 'attachment_file_name',
        doc: 'doc_title',
        task: 'task_name',
        user: 'user_name',
        project: 'project_name',
        channel: 'ch_name',
        team: 'team_name'
    }

    const field = fieldMap[result.type]
    if (!field || !result.highlight[field]) return <span>{title}</span>

    return <HighlightedText text={title} highlights={result.highlight} field={field} />
}

export const getHighlightedContext = (result: SearchResult) => {
    const context = getContext(result)
    if (!result.highlight) return <span>{context}</span>

    const contextFields: Record<string, string[]> = {
        doc: ['doc_body'],
        task: ['task_desc'],
        user: ['user_email']
    }

    const fields = contextFields[result.type] || []
    for (const field of fields) {
        if (result.highlight[field]) {
            return (
                <div className="flex flex-col gap-1">
                    <span className="opacity-70">{context}</span>
                    <SafeHtml
                        as="div"
                        className="text-xs bg-muted/30 p-1.5 rounded border border-border/50 italic"
                        html={`...${result.highlight[field][0]}...`}
                        sanitizer={sanitizePlainHtml}
                    />
                </div>
            )
        }
    }

    return <span>{context}</span>
}

export const isResultPreviewable = (result: SearchResult): boolean => {
    if (result.type !== "attachment" || !result.attachment) return false
    const attachment = result.attachment
    const type = attachment.attachment_type || getAttachmentType(attachment.attachment_file_name || "")
    return type === 'image' || type === 'video'
}

export const getAttachmentLightboxData = (result: SearchResult, selfUserUUID: string) => {
    if (result.type !== "attachment" || !result.attachment) return null

    const rawAttachment = result.attachment
    
    // Map backend Opensearch fields to frontend AttachmentMediaReq
    const mappedAttachment: AttachmentMediaReq = {
        attachment_uuid: rawAttachment.attachment_id || rawAttachment.attachment_uuid,
        attachment_file_name: rawAttachment.attachment_file_name,
        attachment_obj_key: rawAttachment.attachment_object_key || rawAttachment.attachment_obj_key,
        attachment_type: rawAttachment.attachment_type || getAttachmentType(rawAttachment.attachment_file_name || ""),
        attachment_size: rawAttachment.attachment_size || 0,
        attachment_created_at: rawAttachment.created_date ? new Date(rawAttachment.created_date * 1000).toISOString() : new Date().toISOString(),
        attachment_width: rawAttachment.attachment_width,
        attachment_height: rawAttachment.attachment_height,
        attachment_duration: rawAttachment.attachment_duration,
        attachment_raw_type: rawAttachment.attachment_raw_type
    }

    let mediaGetUrl = ""

    if (rawAttachment.attachment_doc_id) {
        mediaGetUrl = `${GetEndpointUrl.GetDocMedia}/${rawAttachment.attachment_doc_id}`
    } else if (rawAttachment.attachment_chat_grp_id) {
        if (rawAttachment.attachment_chat_grp_id.includes(" ")) {
            const otherUUID = getOtherUserId(rawAttachment.attachment_chat_grp_id, selfUserUUID)
            mediaGetUrl = `${GetEndpointUrl.GetChatMedia}/${otherUUID}`
        } else {
            mediaGetUrl = `${GetEndpointUrl.GetGroupChatMedia}/${rawAttachment.attachment_chat_grp_id}`
        }
    } else if (rawAttachment.attachment_post_id) {
        mediaGetUrl = `${GetEndpointUrl.GetChannelMedia}/${rawAttachment.attachment_channel_id}`
    } else if (rawAttachment.attachment_project_id || rawAttachment.attachment_project_uuid) {
        const projectID = rawAttachment.attachment_project_id || rawAttachment.attachment_project_uuid
        mediaGetUrl = `${GetEndpointUrl.GetProjectMedia}/${projectID}`
    } else if (rawAttachment.attachment_task_id) {
        const projectID = rawAttachment.attachment_project_id || rawAttachment.attachment_project_uuid
        if (projectID) {
            mediaGetUrl = `${GetEndpointUrl.GetProjectMedia}/${projectID}`
        } else {
            mediaGetUrl = GetEndpointUrl.PublicAttachmentURL 
        }
    }

    return {
        allMedia: [mappedAttachment],
        media: mappedAttachment,
        mediaGetUrl
    }
}
