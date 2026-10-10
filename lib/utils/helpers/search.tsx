"use client"

import { displayNameOf } from "@/lib/personName"
import { memo } from "react"
import { Search, MessageSquare, FileText, Paperclip, CheckSquare, MessageCircle, User, FolderKanban, Hash, LayoutDashboard } from "lucide-react"
import { SearchResult } from "@/services/searchService"
import { ChatUserAvatar } from "@/components/chat/chatUserAvatar"
import { cn } from "@/lib/utils/helpers/cn"
import { GetEndpointUrl } from "@/services/endPoints"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { AttachmentMediaReq } from "@/types/attachment"
import { sanitizePlainHtml } from "@/lib/sanitizeHtml"
import { SafeHtml } from "@/components/safeHtml/SafeHtml"
import { useBotKindMap } from "@/hooks/useBotKinds"
import { relayKindOf, splitPlainRelayLabel, type RelayedAuthor } from "@/lib/relayedAuthor"

const HighlightedText = memo(({ text, highlights, field }: { text: string, highlights?: any, field: string }) => {
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

const getTitle = (result: SearchResult): string => {
    switch (result.type) {
        case "chat": return result.chat?.chat_body || ""
        case "post": return result.post?.post_body || ""
        case "doc": return result.doc?.doc_title || ""
        case "board": return result.board?.board_title || ""
        case "task": return result.task?.task_name || ""
        case "comment": return result.comment?.comment_body || ""
        case "attachment": return result.attachment?.attachment_file_name || ""
        case "user": return displayNameOf(result.user) || ""
        case "project": return result.project?.project_name || ""
        case "channel": return result.channel?.ch_name || ""
        case "team": return result.team?.team_name || ""
        default: return ""
    }
}

const contextText = (result: SearchResult): string => {
    switch (result.type) {
        case "chat": return `Chat message`
        case "post": return `Post in ${result.post?.post_ch_name}`
        case "doc": return `Document by ${result.doc?.doc_created_by_user_full_name}`
        case "board": return `Board by ${result.board?.board_created_by_user_full_name}`
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

// The id fields a hit of each kind carries, in the order they're trusted.
const ID_FIELDS = ["uuid", "id", "chat_id", "post_id", "comment_id", "comment_uuid", "attachment_id", "doc_uuid", "board_uuid", "task_id", "user_id", "project_id", "ch_id", "team_id"]

/**
 * Keys for a list of search hits that stay with each hit, not with its
 * position: a refined query reorders the list, and keyed by index every row
 * re-rendered as somebody else's. A hit with no id, or one listed twice, falls
 * back to its position, so the keys are always unique.
 */
export function searchResultKeys(results: SearchResult[]): string[] {
  const seen = new Set<string>()
  return results.map((result, index) => {
    const item = (result as unknown as Record<string, Record<string, unknown> | undefined>)[result.type]
    const id = item ? ID_FIELDS.map((f) => item[f]).find((v) => typeof v === "string" && v !== "") : undefined
    let key = `${result.type}:${id ?? `#${index}`}`
    if (seen.has(key)) key = `${key}#${index}`
    seen.add(key)
    return key
  })
}

export const getIcon = (result: SearchResult, iconClassName = "h-4 w-4") => {
    if (result.type === "user") {
        return (
            <ChatUserAvatar
                userProfileObjKey={result.user?.user_profile_object_key}
                userName={displayNameOf(result.user)}
            />
        )
    }

    switch (result.type) {
        case "chat": return <MessageCircle className={iconClassName} />
        case "post": return <MessageSquare className={iconClassName} />
        case "doc": return <FileText className={iconClassName} />
        case "board": return <LayoutDashboard className={iconClassName} />
        case "task": return <CheckSquare className={iconClassName} />
        case "comment": return <MessageCircle className={cn(iconClassName, "opacity-70")} />
        case "attachment": return <Paperclip className={iconClassName} />
        case "project": return <FolderKanban className={iconClassName} />
        case "channel": return <Hash className={iconClassName} />
        case "team": return <User className={cn(iconClassName, "text-primary")} />
        default: return <Search className={iconClassName} />
    }
}

/**
 * The guest or Slack person behind a message or reply hit, when the Guests or
 * Slack bot posted it (see lib/relayedAuthor): search indexes the stored text
 * with its "[Priya (Acme) (guest)]" label, and names the bot as the author.
 * kinds is every bot's kind by uuid. Pure.
 */
export function relayedHit(result: SearchResult, kinds: Record<string, string> | undefined): RelayedAuthor | null {
    if (!kinds) return null
    if (result.type === "post") return splitPlainRelayLabel(result.post?.post_body, relayKindOf(kinds[result.post?.post_by_user_id]))
    if (result.type === "comment") return splitPlainRelayLabel(result.comment?.comment_body, relayKindOf(kinds[result.comment?.comment_by_user_id]))
    return null
}

// A relayed hit reads "Priya (Acme): what she wrote", as the channel list
// does, rather than "[Priya (Acme) (guest)]what she wrote" under the bot.
function HitTitle({ result }: { result: SearchResult }) {
    const relayed = relayedHit(result, useBotKindMap())
    if (!relayed) return plainHighlightedTitle(result)
    const highlight: string | undefined = result.highlight?.[result.type === "post" ? "post_body" : "comment_body"]?.[0]
    return (
        <span>
            <span className="font-medium">{relayed.name}:</span>{" "}
            {highlight ? (
                <SafeHtml as="span" html={splitPlainRelayLabel(highlight, relayed.kind)?.body ?? highlight} sanitizer={sanitizePlainHtml} />
            ) : (
                relayed.body
            )}
        </span>
    )
}

function HitContext({ result }: { result: SearchResult }) {
    const relayed = relayedHit(result, useBotKindMap())
    if (relayed && result.type === "comment" && !result.comment?.comment_doc_id) return <>Comment by {relayed.name}</>
    return <>{contextText(result)}</>
}

/** Where a hit is from, and for a reply, who wrote it. */
export const getContext = (result: SearchResult) => <HitContext result={result} />

export const getHighlightedTitle = (result: SearchResult) => <HitTitle result={result} />

const plainHighlightedTitle = (result: SearchResult) => {
    const title = getTitle(result)
    if (!result.highlight) return <span>{title}</span>

    const fieldMap: Record<string, string> = {
        chat: 'chat_body',
        post: 'post_body',
        comment: 'comment_body',
        attachment: 'attachment_file_name',
        doc: 'doc_title',
        board: 'board_title',
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
                <div className="flex flex-col gap-0.5">
                    <span>{context}</span>
                    <SafeHtml
                        as="div"
                        className="text-foreground/80 line-clamp-2"
                        html={`…${result.highlight[field][0]}…`}
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
