"use client"

import { displayNameOf } from "@/lib/personName"
import { Fragment } from "react"
import { Search, MessageSquare, FileText, Paperclip, CheckSquare, MessageCircle, Users, FolderKanban, Hash, LayoutDashboard } from "@/lib/icons"
import { SearchResult } from "@/services/searchService"
import { ChatUserAvatar } from "@/components/chat/chatUserAvatar"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { GetEndpointUrl } from "@/services/endPoints"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"
import { getAttachmentType } from "@/lib/utils/file/getAttachmentType"
import { AttachmentMediaReq } from "@/types/attachment"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { fragmentEdges, highlightRuns, highlightText } from "@/lib/search/highlight"
import { useBotKindMap } from "@/hooks/useBotKinds"
import { relayKindOf, splitPlainRelayLabel, type RelayedAuthor } from "@/lib/relayedAuthor"

/**
 * A highlighter fragment as text with its matches marked. Built from text runs
 * (lib/search/highlight), never from the fragment's HTML: the fields are stored
 * escaped, the highlighter can split an entity, and a hostile body must not
 * reach the DOM as markup. `full` is the field's whole text when the answer
 * carries it, so an ellipsis appears only on a side that was cut.
 */
export function Snippet({ fragment, full, className }: { fragment: string; full?: string | null; className?: string }) {
    const runs = highlightRuns(fragment)
    if (runs.length === 0) return null
    const { before, after } = fragmentEdges(runs.map((r) => r.text).join(""), full)
    return (
        <span className={className}>
            {before && "…"}
            {runs.map((r, i) => (r.hit ? <mark key={i}>{r.text}</mark> : <Fragment key={i}>{r.text}</Fragment>))}
            {after && "…"}
        </span>
    )
}

/** The field a hit's title is read from, and the one its highlight is for. */
const TITLE_FIELD: Record<SearchResult["type"], string> = {
    chat: "chat_body",
    post: "post_body",
    comment: "comment_body",
    attachment: "attachment_file_name",
    doc: "doc_title",
    board: "board_title",
    task: "task_name",
    user: "user_name",
    project: "project_name",
    channel: "ch_name",
    team: "team_name",
}

/** A hit's title as plain text: stored bodies are escaped HTML ("everyone&#39;s"). */
export const getTitle = (result: SearchResult): string => {
    switch (result.type) {
        case "chat": return removeHtmlTags(result.chat?.chat_body)
        case "post": return removeHtmlTags(result.post?.post_body)
        case "doc": return removeHtmlTags(result.doc?.doc_title) || "Untitled doc"
        case "board": return removeHtmlTags(result.board?.board_title) || "Untitled board"
        case "task": return removeHtmlTags(result.task?.task_name)
        case "comment": return removeHtmlTags(result.comment?.comment_body)
        case "attachment": return removeHtmlTags(result.attachment?.attachment_file_name || result.attachment?.attachment_name) || "Attachment"
        case "user": return displayNameOf(result.user) || ""
        case "project": return removeHtmlTags(result.project?.project_name)
        case "channel": return removeHtmlTags(result.channel?.ch_name)
        case "team": return removeHtmlTags(result.team?.team_name)
        default: return ""
    }
}

// "#engineering · Maya Chen": where a hit is, and who wrote it, in words a
// person uses. Nothing is said that the answer doesn't carry: a task with
// nobody on it used to read "Task assigned to undefined".
const contextText = (result: SearchResult): string => {
    const join = (...parts: (string | undefined | null)[]) => parts.filter((p) => p && p.trim()).join(" · ")
    switch (result.type) {
        case "chat": return result.chat?.chat_by_user_full_name ? `Message from ${result.chat.chat_by_user_full_name}` : "Message"
        case "post": return join(result.post?.post_ch_name && `#${result.post.post_ch_name}`, result.post?.post_by_user_full_name) || "Message"
        case "doc": return result.doc?.doc_created_by_user_full_name ? `Doc by ${result.doc.doc_created_by_user_full_name}` : "Doc"
        case "board": return result.board?.board_created_by_user_full_name ? `Board by ${result.board.board_created_by_user_full_name}` : "Board"
        case "task": return join(result.task?.task_project_name, result.task?.task_assignee_user_full_name) || "Task"
        case "comment":
            if (result.comment?.comment_doc_id) return result.comment?.comment_doc_title ? `Comment on ${result.comment.comment_doc_title}` : "Comment on a doc"
            return result.comment?.comment_by_user_full_name ? `Reply by ${result.comment.comment_by_user_full_name}` : "Reply"
        case "attachment":
            if (result.attachment?.attachment_doc_id) return result.attachment?.attachment_doc_title ? `File in ${result.attachment.attachment_doc_title}` : "File in a doc"
            return result.attachment?.attachment_channel_name ? `File in #${result.attachment.attachment_channel_name}` : "File in a chat"
        case "user": return result.user?.user_email || "Person"
        case "project": return result.project?.project_team_name ? `Project · ${result.project.project_team_name}` : "Project"
        case "channel": return "Channel"
        case "team": return "Team"
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

/**
 * Whose colour a hit wears: a thing its own, a message its channel's (or its
 * author's in a DM), a task its project's. lib/campHue turns the id into one
 * of the six camp hues, so a channel or project is the same colour in search
 * as everywhere else.
 */
export function hitHueId(result: SearchResult): string | undefined {
    switch (result.type) {
        case "post": return result.post?.post_ch_id || result.post?.post_channel_id
        case "chat": return result.chat?.chat_by_user_id
        case "comment": return result.comment?.comment_channel_id || result.comment?.comment_by_user_id
        case "task": return result.task?.task_project_id || result.task?.task_id
        case "doc": return result.doc?.doc_uuid
        case "board": return result.board?.board_uuid
        case "attachment": return result.attachment?.attachment_channel_id || result.attachment?.attachment_doc_id || result.attachment?.attachment_id
        case "project": return result.project?.project_id
        case "channel": return result.channel?.ch_id
        case "team": return result.team?.team_id
        case "user": return result.user?.user_id
        default: return undefined
    }
}

const HIT_GLYPH: Record<SearchResult["type"], typeof Search> = {
    chat: MessageCircle,
    post: MessageSquare,
    comment: MessageCircle,
    doc: FileText,
    board: LayoutDashboard,
    task: CheckSquare,
    attachment: Paperclip,
    project: FolderKanban,
    channel: Hash,
    team: Users,
    user: Search,
}

/**
 * A hit's mark: a person's face (a photo, or their coloured initials), and
 * for anything else its kind's glyph on a tile of its identity hue. A tile
 * rather than a bare glyph, so the mark holds its contrast on a hovered or
 * selected row.
 */
export const getIcon = (result: SearchResult) => {
    if (result.type === "user") {
        return (
            <ChatUserAvatar
                userProfileObjKey={result.user?.user_profile_object_key}
                userName={displayNameOf(result.user)}
            />
        )
    }
    const Glyph = HIT_GLYPH[result.type] ?? Search
    return <IdentityMark variant="tile" size={24} id={hitHueId(result)} icon={<Glyph />} />
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

/** The highlighter's best fragment for a hit's title field, if it sent one. */
function titleFragment(result: SearchResult): string | undefined {
    return result.highlight?.[TITLE_FIELD[result.type]]?.[0]
}

/** The stored text the title fragment came from, when the answer carries it. */
function titleFull(result: SearchResult): string | undefined {
    const field = TITLE_FIELD[result.type]
    const obj = result[result.type] as Record<string, unknown> | undefined
    const value = obj?.[field]
    return typeof value === "string" ? value : undefined
}

// A relayed hit reads "Priya (Acme): what she wrote", as the channel list
// does, rather than "[Priya (Acme) (guest)]what she wrote" under the bot.
function HitTitle({ result }: { result: SearchResult }) {
    const relayed = relayedHit(result, useBotKindMap())
    if (!relayed) return plainHighlightedTitle(result)
    const fragment = titleFragment(result)
    const body = fragment ? (splitPlainRelayLabel(fragment, relayed.kind)?.body ?? fragment) : undefined
    return (
        <span>
            <span className="font-medium">{relayed.name}:</span>{" "}
            {body ? <Snippet fragment={body} full={relayed.body} /> : removeHtmlTags(relayed.body)}
        </span>
    )
}

function HitContext({ result }: { result: SearchResult }) {
    const relayed = relayedHit(result, useBotKindMap())
    if (relayed && result.type === "comment" && !result.comment?.comment_doc_id) return <>Reply by {relayed.name}</>
    if (relayed && result.type === "post" && result.post?.post_ch_name) return <>#{result.post.post_ch_name} · {relayed.name}</>
    return <>{contextText(result)}</>
}

/** Where a hit is from, and for a reply, who wrote it. */
export const getContext = (result: SearchResult) => <HitContext result={result} />

export const getHighlightedTitle = (result: SearchResult) => <HitTitle result={result} />

const plainHighlightedTitle = (result: SearchResult) => {
    const fragment = titleFragment(result)
    if (!fragment) return <span>{getTitle(result)}</span>
    return <Snippet fragment={fragment} full={titleFull(result)} />
}

/** The fields whose fragments say why a hit matched when its title doesn't. */
const CONTEXT_FIELDS: Partial<Record<SearchResult["type"], string[]>> = {
    doc: ["doc_body"],
    task: ["task_desc"],
    user: ["user_email"],
}

/**
 * Where a hit is from, and under it the passage that matched when the title
 * didn't: a doc's body, a task's description. Up to two passages, each with an
 * ellipsis only where it was cut.
 */
export const getHighlightedContext = (result: SearchResult) => {
    const context = getContext(result)
    for (const field of CONTEXT_FIELDS[result.type] || []) {
        const fragments = result.highlight?.[field]?.filter((f) => highlightText(f)) ?? []
        if (fragments.length === 0) continue
        const obj = result[result.type] as Record<string, unknown> | undefined
        const full = typeof obj?.[field] === "string" ? (obj[field] as string) : undefined
        return (
            <span className="flex flex-col gap-0.5">
                <span>{context}</span>
                <span className="text-foreground/80 line-clamp-2">
                    {fragments.slice(0, 2).map((f, i) => (
                        <Fragment key={i}>
                            {i > 0 && " "}
                            <Snippet fragment={f} full={full} />
                        </Fragment>
                    ))}
                </span>
            </span>
        )
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
