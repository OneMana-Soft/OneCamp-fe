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
  // The record's own id, where the server sends one, names the event outright.
  // Without it, two items of one kind in the same second (the server sent
  // times to the second until 11 Oct) were one row, and the second was lost.
  const id = recordId(item)
  if (id) return [item.activity_type, "id", id].join("|")
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
  if (item.activity_type === "NOTICE") return Boolean(item.notice)
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

/**
 * One row for one thing said, however many records the server sends for it.
 *
 * THE DEMO'S DOUBLED MENTIONS (11 Oct). Activity > All showed "Jonas Weber
 * mentioned you" twice, word for word. The client was not doubling anything:
 * the server sent two mention records on two different posts. Each nightly
 * refresh of the demo renames the curated channels out of the way
 * ("engineering-retired-1791614952") and posts the conversation again in fresh
 * ones; the visitor stays a member of the old copies, and the feed lists
 * mentions from every channel the reader is in, archived or not. So every
 * refresh added an identical copy of each mention, with its own id.
 *
 * A reader can do nothing with the second copy of a sentence they have already
 * been shown, wherever it came from, so the feed shows the newest one: the same
 * kind of item, by the same person, saying the same words. Different words,
 * different people or different kinds stay separate rows. Items arrive newest
 * first, so the first of each kept is the newest.
 */
export function collapseEchoes(items: UnifiedActivityItem[]): UnifiedActivityItem[] {
  const seen = new Set<string>()
  const out: UnifiedActivityItem[] = []
  for (const item of items) {
    // A record the server names by its own id is a real event: two of them
    // with the same words are two mentions, and both show. Only records with
    // no id of their own (the demo's copies before 11 Oct) collapse by words.
    const key = recordId(item) ? "" : echoKey(item)
    if (key) {
      if (seen.has(key)) continue
      seen.add(key)
    }
    out.push(item)
  }
  return out
}

/** Kind, author and words, or "" for an item that has no words of its own (a reaction). */
export function echoKey(item: UnifiedActivityItem): string {
  if (item.activity_type === "MENTION" && item.mention) {
    const m = item.mention
    const by = m.mention_post?.post_by?.user_uuid || m.mention_chat?.chat_from?.user_uuid || m.mention_comment?.comment_by?.user_uuid || ""
    const text = m.mention_post?.post_text || m.mention_chat?.chat_body_text || m.mention_comment?.comment_text || ""
    const words = plainWords(text)
    return by && words ? ["MENTION", by, words].join("|") : ""
  }
  if (item.activity_type === "COMMENT" && item.comment) {
    const c = item.comment
    const words = plainWords(c.comment_text || "")
    const by = c.comment_by?.user_uuid || ""
    return by && words ? ["COMMENT", by, words].join("|") : ""
  }
  return ""
}

/** The words of a message, without its markup, case or spacing. */
function plainWords(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

/** The record's own id, where the server sends one. */
function recordId(item: UnifiedActivityItem): string | undefined {
  return (
    item.id ||
    item.notice?.id ||
    item.mention?.uid ||
    (item.activity_type === "COMMENT" ? item.comment?.comment_uuid : undefined) ||
    (item.activity_type === "REACTION" ? item.reaction?.uid : undefined) ||
    undefined
  )
}

/**
 * The inbox's page of the feed: notices included (activity type NOTICE), which
 * the API sends only to an app that asks, since an older one has no badge for
 * them. The tabs' counts and the list read the same key, so they share a cache.
 */
/** The inbox's page size; the tabs count its first page. */
export const INBOX_PAGE_SIZE = 20

export function inboxFeedKey(endpoint: string, limit: number, cursor = ""): string {
  return `${endpoint}?limit=${limit}&notices=1${cursor ? `&beforeTime=${encodeURIComponent(cursor)}` : ""}`
}
