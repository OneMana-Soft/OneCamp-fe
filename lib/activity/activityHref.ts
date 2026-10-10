import type { UnifiedActivityItem } from "@/types/activity"
import type { CommentInfoInterface } from "@/types/comment"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"
import { getOtherUserId } from "@/lib/utils/getOtherUserId"

/**
 * Where an Activity row opens: the message, thread, task, doc or board it is
 * about. Pure, so every kind of row is tested without a router.
 *
 * WHY IT IS ITS OWN FUNCTION. The rows used to push paths written three ways.
 * A mention pushed "app/channel/…" with no leading slash, which the router
 * resolves against /app/activity, so opening the most common notification there
 * is landed on "This page doesn't exist" (/app/app/channel/…). A mention in a
 * DM added the message id twice (/app/chat/{person}/{id}/{id}, a route that
 * doesn't exist), a mention in a thread reply opened nothing, and a reaction on
 * a task read a comment that wasn't there and threw. Every path here is
 * absolute and every field is optional, because the payload is.
 *
 * Returns null when the row carries nothing to open.
 */
export function activityHref(activity: UnifiedActivityItem, currentUserId: string | undefined): string | null {
  switch (activity.activity_type) {
    case "MENTION": {
      const m = activity.mention
      if (!m) return null
      return (
        postHref(m.mention_post) ??
        chatHref(m.mention_chat, currentUserId) ??
        commentHref(m.mention_comment, currentUserId) ??
        (m.mention_task?.task_uuid ? `/app/task/${m.mention_task.task_uuid}` : null) ??
        (m.mention_doc?.doc_uuid ? `/app/doc/${m.mention_doc.doc_uuid}/comment` : null)
      )
    }
    case "COMMENT":
      return commentHref(activity.comment, currentUserId)
    case "REACTION": {
      const r = activity.reaction
      if (!r) return null
      return (
        postHref(r.post) ??
        chatHref(r.chat, currentUserId) ??
        (r.reaction_task?.task_uuid ? `/app/task/${r.reaction_task.task_uuid}` : null) ??
        (r.reaction_doc?.doc_uuid ? `/app/doc/${r.reaction_doc.doc_uuid}/comment` : null) ??
        commentHref(r.comment, currentUserId)
      )
    }
    default:
      return null
  }
}

/** A channel message, in its channel with the thread open. */
function postHref(post: Partial<PostsRes> | undefined | null): string | null {
  const channel = post?.post_channel?.ch_uuid
  return channel && post?.post_uuid ? `/app/channel/${channel}/${post.post_uuid}` : null
}

/** A message in a DM (to the other person) or a group, with it in view. */
function chatHref(chat: Partial<ChatInfo> | undefined | null, currentUserId: string | undefined): string | null {
  const group = chat?.chat_dm?.dm_grouping_id
  if (!group || !chat?.chat_uuid) return null
  // A DM's grouping id is the two people's ids with a space between them.
  if (!group.includes(" ")) return `/app/chat/group/${group}/${chat.chat_uuid}`
  if (!currentUserId) return null
  return `/app/chat/${getOtherUserId(group, currentUserId)}/${chat.chat_uuid}`
}

/** A reply opens what it replies to: the thread, the task, the doc or the board. */
function commentHref(comment: Partial<CommentInfoInterface> | undefined | null, currentUserId: string | undefined): string | null {
  if (!comment) return null
  return (
    postHref(comment.comment_post) ??
    chatHref(comment.comment_chat, currentUserId) ??
    (comment.comment_task?.task_uuid ? `/app/task/${comment.comment_task.task_uuid}` : null) ??
    (comment.comment_doc?.doc_uuid ? `/app/doc/${comment.comment_doc.doc_uuid}/comment` : null) ??
    (comment.comment_board?.board_uuid ? `/app/board/${comment.comment_board.board_uuid}` : null)
  )
}
