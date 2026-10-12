import type { SearchResult } from "@/services/searchService"
import { chatPath } from "@/lib/chat/chatPath"

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
      return ch ? `/app/channel/${ch}/${result.post.post_id}` : "/app/posts"
    }
    case "doc":
      return `/app/doc/${result.doc?.doc_uuid}`
    case "board":
      return `/app/board/${result.board?.board_uuid}`
    case "task":
      return `/app/task/${result.task?.task_id}`
    case "comment": {
      const c = result.comment ?? {}
      if (c.comment_doc_id) return `/app/doc/${c.comment_doc_id}/comment`
      if (c.comment_chat_grp_id) return chatPath(c.comment_chat_grp_id, selfUUID, c.comment_chat_id)
      if (c.comment_task_id) return `/app/task/${c.comment_task_id}`
      if (c.comment_post_id) return `/app/channel/${c.comment_channel_id}/${c.comment_post_id}`
      return null
    }
    case "attachment": {
      const a = result.attachment ?? {}
      if (a.attachment_doc_id) return `/app/doc/${a.attachment_doc_id}/comment`
      if (a.attachment_chat_grp_id) return chatPath(a.attachment_chat_grp_id, selfUUID, a.attachment_chat_id)
      if (a.attachment_task_id) return `/app/task/${a.attachment_task_id}`
      if (a.attachment_post_id) return `/app/channel/${a.attachment_channel_id}/${a.attachment_post_id}`
      return null
    }
    case "project":
      return `/app/project/${result.project?.project_id}`
    case "team":
      return `/app/team/${result.team?.team_id}`
    case "channel":
      return `/app/channel/${result.channel?.ch_id}`
    default:
      return null
  }
}
