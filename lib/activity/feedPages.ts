import type { UnifiedActivityItem } from "@/types/activity"

/**
 * The pages of the Activity feed, joined into one list. Pure, so the paging is
 * tested without a server.
 *
 * WHY NOT THE ITEM'S `time`. The server writes an item's `time` to the second
 * (Go's time.RFC3339), and the list used `type + time` as each item's identity.
 * Two mentions made within one second (one message naming you in three places,
 * an agent replying in a burst, a seed run) then counted as one, and the list
 * kept only the first: the demo's All tab showed 2 of its 6 mentions. The record
 * inside the item keeps its timestamp to the nanosecond, and together with who
 * did it and what it is on, it names one event.
 */
export function activityKey(item: UnifiedActivityItem): string {
  const m = item.mention
  const c = item.comment
  const r = item.reaction
  if (item.activity_type === "MENTION" && m) {
    const on =
      m.mention_post?.post_uuid ||
      m.mention_chat?.chat_uuid ||
      targetOfComment(m.mention_comment) ||
      m.mention_task?.task_uuid ||
      m.mention_doc?.doc_uuid ||
      ""
    const by =
      m.mention_post?.post_by?.user_uuid || m.mention_chat?.chat_from?.user_uuid || m.mention_comment?.comment_by?.user_uuid || ""
    return ["MENTION", m.mention_created_at || item.time, by, on].join("|")
  }
  if (item.activity_type === "COMMENT" && c) {
    return ["COMMENT", c.comment_created_at || item.time, c.comment_by?.user_uuid || "", c.comment_uuid || targetOfComment(c)].join("|")
  }
  if (item.activity_type === "REACTION" && r) {
    const on = r.post?.post_uuid || r.chat?.chat_uuid || targetOfComment(r.comment) || r.reaction_task?.task_uuid || r.reaction_doc?.doc_uuid || ""
    return ["REACTION", r.reaction_added_at || item.time, r.reaction_added_by?.user_uuid || "", r.reaction_emoji_id || "", r.uid || on].join("|")
  }
  return [item.activity_type, item.time].join("|")
}

function targetOfComment(c: UnifiedActivityItem["comment"] | undefined): string {
  if (!c) return ""
  return (
    c.comment_post?.post_uuid ||
    c.comment_chat?.chat_uuid ||
    c.comment_task?.task_uuid ||
    c.comment_doc?.doc_uuid ||
    c.comment_board?.board_uuid ||
    c.comment_created_at ||
    ""
  )
}

/**
 * Whether an item has anything to show. The feed's query drops a mention's
 * message when the reader can no longer see it (they left the channel, or
 * the message was deleted), but keeps the mention, so it arrived with a date
 * and nothing else and drew as "Unknown user", opening nothing.
 */
export function hasSubject(item: UnifiedActivityItem): boolean {
  if (item.activity_type === "MENTION") {
    const m = item.mention
    return Boolean(m && (m.mention_chat || m.mention_post || m.mention_comment || m.mention_task || m.mention_doc))
  }
  if (item.activity_type === "COMMENT") return Boolean(item.comment)
  if (item.activity_type === "REACTION") return Boolean(item.reaction)
  return false
}

/** The pages in the order they were asked for, each item once. */
export function mergeActivityPages(pages: UnifiedActivityItem[][]): UnifiedActivityItem[] {
  const seen = new Set<string>()
  const out: UnifiedActivityItem[] = []
  for (const page of pages) {
    for (const item of page) {
      const key = activityKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

/**
 * The cursor for the page after one whose oldest item is at `oldestTime`.
 *
 * The server answers "everything strictly older than the cursor", and it reads
 * the cursor to the second. Asking for "older than the oldest item's second"
 * skipped every other item in that second that had not fitted on the page, so
 * a page boundary inside a busy second lost items for good. Asking from the
 * NEXT second takes that second again; mergeActivityPages drops the items
 * already shown.
 */
export function olderPageCursor(oldestTime: string | undefined): string {
  if (!oldestTime) return ""
  const at = Date.parse(oldestTime)
  if (Number.isNaN(at)) return oldestTime
  const nextSecond = Math.floor(at / 1000) * 1000 + 1000
  return new Date(nextSecond).toISOString().replace(/\.\d{3}Z$/, "Z")
}
