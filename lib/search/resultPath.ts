import type { SearchResult } from "@/services/searchService"
import { chatPath } from "@/lib/routes/conversationRoute"
import { route } from "@/lib/conversation/route"
import { calendarRoute } from "@/lib/calendar/route"
import { firstHitWords } from "@/lib/search/highlight"

/** A channel, at one of its messages when there is one (the Link Router). */
const channelPath = (channel: string, message?: string) => route({ conversation: { kind: "channel", id: channel }, ...(message ? { message } : {}) })

/** A thing's own page, or null for a hit that names no thing: never a page of "undefined". */
const page = (kind: string, id: unknown): string | null => ((typeof id === "string" || typeof id === "number") && id !== "" ? `/app/${kind}/${id}` : null)

/**
 * Where a search result opens, as an app path, or null for a result that
 * opens in place rather than at an address (a person opens their card), or
 * that names nowhere it can be opened. One mapping for opening a result, for
 * "Copy link", and for the palette's hits and recent items. Pure.
 *
 * A message in a DM or a group opens in its conversation with its thread
 * (chatPath): a hit used to open /app/chat/<message id>, a conversation
 * "with" a message.
 */
export function resultPath(result: SearchResult, selfUUID: string): string | null {
  switch (result.type) {
    case "chat":
      return chatPath(result.chat?.chat_grp_id, selfUUID, result.chat?.chat_id)
    case "post": {
      const ch = result.post?.post_ch_id || result.post?.post_channel_id
      return ch ? channelPath(ch, result.post.post_id) : "/app/posts"
    }
    case "doc":
      return page("doc", result.doc?.doc_uuid)
    case "board": {
      // A hit on what is written on a board opens it at those words, its Find on them (miro-05): the first words its
      // passage marks. A hit on its name alone opens the board.
      const path = page("board", result.board?.board_uuid)
      const words = result.highlight?.board_text?.map((f) => firstHitWords(f)).find(Boolean)
      return path && words ? `${path}?find=${encodeURIComponent(words)}` : path
    }
    case "task":
      return page("task", result.task?.task_id)
    case "comment": {
      const c = result.comment ?? {}
      if (c.comment_doc_id) return `/app/doc/${c.comment_doc_id}/comment`
      if (c.comment_chat_grp_id) return chatPath(c.comment_chat_grp_id, selfUUID, c.comment_chat_id)
      if (c.comment_task_id) return `/app/task/${c.comment_task_id}`
      if (c.comment_post_id) return channelPath(c.comment_channel_id, c.comment_post_id)
      return null
    }
    case "attachment": {
      const a = result.attachment ?? {}
      if (a.attachment_doc_id) return `/app/doc/${a.attachment_doc_id}/comment`
      if (a.attachment_chat_grp_id) return chatPath(a.attachment_chat_grp_id, selfUUID, a.attachment_chat_id)
      if (a.attachment_task_id) return `/app/task/${a.attachment_task_id}`
      if (a.attachment_post_id) return channelPath(a.attachment_channel_id, a.attachment_post_id)
      return null
    }
    case "project":
      return page("project", result.project?.project_id)
    case "team":
      return page("team", result.team?.team_id)
    case "channel":
      return result.channel?.ch_id ? channelPath(result.channel.ch_id) : null
    case "event":
      return result.event?.event_uuid ? calendarRoute({ event: result.event.event_uuid }) : null
    default:
      return null
  }
}
