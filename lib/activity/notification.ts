/**
 * A notification item in words and parts (hub.md A4–A8). Pure, so each kind of
 * item is tested without rendering.
 *
 *   kindOf      which kind badge the item carries (A5)
 *   sentenceOf  who did what, and where: "Jonas Weber mentioned you in
 *               #engineering", never "in a post", which hid the place (A4)
 *   aggregate   reactions to one message within a day, and repeated mentions in
 *               one thread, as one row (A6)
 *   dayGroupOf  Today, Yesterday, Earlier this week, Older (A7)
 *   priorityGroupOf  Needs a reply, Due soon, From agents (A8)
 */
import { format } from "date-fns"
import { shortDate } from "@/lib/utils/date/shortDate"
import type { UnifiedActivityItem } from "@/types/activity"
import type { UserProfileDataInterface } from "@/types/user"
import type { KindBadgeKind } from "@/components/ui/kindBadge"
import { clockTime } from "@/lib/utils/date/clock"
import { levelWord, noticeBadge, noticeHref, noticeWords, UNOPENED_PLACE } from "@/lib/activity/notice"

export type ActivityType = UnifiedActivityItem["activity_type"]

/**
 * The badge for each type the feed carries. A Record over the union, so a new
 * type the server starts sending fails to compile until it has a badge, and
 * badgeForType() refuses one it was never told about.
 */
export const BADGE_FOR_TYPE: Record<ActivityType, KindBadgeKind> = {
  MENTION: "mention",
  COMMENT: "comment",
  REACTION: "reaction",
  // A notice's own kind picks its badge (noticeBadge); this is the fallback.
  NOTICE: "comment",
}

export function badgeForType(type: string): KindBadgeKind {
  const kind = (BADGE_FOR_TYPE as Record<string, KindBadgeKind | undefined>)[type]
  if (!kind) throw new Error(`No kind badge for activity type ${type}`)
  return kind
}

/** The badge one item carries: a reply to your thread is a reply, an agent's mention is the agent's. */
export function kindOf(item: UnifiedActivityItem): KindBadgeKind {
  const base = item.activity_type === "NOTICE" ? noticeBadge(item.notice) : badgeForType(item.activity_type)
  if (item.actor_kind === "agent" && base !== "reaction") return "agent"
  if (item.actor_kind === "app" && base !== "reaction") return "app"
  if (item.activity_type === "COMMENT" && (item.comment?.comment_post || item.comment?.comment_chat)) return "reply"
  return base
}

export interface Sentence {
  actor: UserProfileDataInterface | undefined
  verb: string
  /** The place or object, in bold after the verb ("#engineering", "Customer onboarding"). */
  place: string
  /** The words under the sentence, as HTML (mention chips are kept for the preview). */
  preview: string
  /** When it happened, to the nanosecond where the record keeps it. */
  at: string
}

const channelName = (name?: string) => (name ? `#${name}` : "")

/** Who did what, and where. */
export function sentenceOf(item: UnifiedActivityItem): Sentence {
  const m = item.mention
  const c = item.comment
  const r = item.reaction
  if (item.activity_type === "MENTION" && m) {
    if (m.mention_post) {
      return { actor: m.mention_post.post_by, verb: "mentioned you in", place: channelName(m.mention_post.post_channel?.ch_name) || "a channel", preview: m.mention_post.post_text ?? "", at: m.mention_created_at || item.time }
    }
    if (m.mention_chat) {
      return { actor: m.mention_chat.chat_from, verb: "mentioned you in", place: "a direct message", preview: m.mention_chat.chat_body_text ?? "", at: m.mention_created_at || item.time }
    }
    if (m.mention_comment) {
      return { actor: m.mention_comment.comment_by, verb: "mentioned you in a comment on", place: commentPlace(m.mention_comment), preview: m.mention_comment.comment_text ?? "", at: m.mention_created_at || item.time }
    }
    if (m.mention_task) {
      return { actor: m.mention_task.task_created_by, verb: "mentioned you in", place: m.mention_task.task_name || "a task", preview: "", at: m.mention_created_at || item.time }
    }
    if (m.mention_doc) {
      return { actor: m.mention_doc.doc_created_by, verb: "mentioned you in", place: m.mention_doc.doc_title || "a doc", preview: "", at: m.mention_created_at || item.time }
    }
  }
  if (item.activity_type === "COMMENT" && c) {
    const onMessage = c.comment_post || c.comment_chat
    return {
      actor: c.comment_by,
      verb: onMessage ? "replied to your thread in" : "commented on",
      place: commentPlace(c),
      preview: c.comment_text ?? "",
      at: c.comment_created_at || item.time,
    }
  }
  if (item.activity_type === "NOTICE" && item.notice) {
    const w = noticeWords(item.notice)
    return { actor: w.actor, verb: w.verb, place: w.place, preview: w.preview, at: item.notice.created_at || item.time }
  }
  if (item.activity_type === "REACTION" && r) {
    const place = channelName(r.post?.post_channel?.ch_name) || (r.chat ? "a direct message" : "") || r.reaction_task?.task_name || r.reaction_doc?.doc_title || ""
    return {
      actor: r.reaction_added_by,
      verb: place ? "reacted to your message in" : "reacted to your message",
      place,
      preview: r.post?.post_text || r.chat?.chat_body_text || r.comment?.comment_text || "",
      at: r.reaction_added_at || item.time,
    }
  }
  return { actor: undefined, verb: "", place: "", preview: "", at: item.time }
}

function commentPlace(c: NonNullable<UnifiedActivityItem["comment"]>): string {
  return (
    channelName(c.comment_post?.post_channel?.ch_name) ||
    (c.comment_chat ? "a direct message" : "") ||
    c.comment_task?.task_name ||
    c.comment_doc?.doc_title ||
    c.comment_board?.board_title ||
    "your post"
  )
}

/** A row of the feed: one item, or several collapsed into one (A6). */
export interface FeedEntry {
  key: string
  item: UnifiedActivityItem
  /** Everyone else in a collapsed row, newest first. */
  others: UnifiedActivityItem[]
  /**
   * "reactions" for reactions to one message, "mentions" for repeated
   * mentions in one thread, "shares" for one person's docs shared with you.
   */
  collapsed?: "reactions" | "mentions" | "shares"
}

const DAY_MS = 86_400_000

function reactionTarget(item: UnifiedActivityItem): string {
  const r = item.reaction
  return r?.post?.post_uuid || r?.chat?.chat_uuid || r?.comment?.comment_uuid || r?.reaction_task?.task_uuid || r?.reaction_doc?.doc_uuid || ""
}

function mentionThread(item: UnifiedActivityItem): string {
  const m = item.mention
  const by = m?.mention_post?.post_by?.user_uuid || m?.mention_comment?.comment_by?.user_uuid || m?.mention_chat?.chat_from?.user_uuid || ""
  const comment = m?.mention_comment
  const thread = comment?.comment_post?.post_uuid || comment?.comment_chat?.chat_uuid || ""
  return thread && by ? `${thread}|${by}` : ""
}

/** Who shared a doc with you, for a share notice (its sentence's actor); "" for anything else. */
function sharer(item: UnifiedActivityItem): string {
  const n = item.notice
  if (item.activity_type !== "NOTICE" || n?.kind !== "doc.shared") return ""
  return (n.agent ?? n.actor)?.user_uuid ?? ""
}

/**
 * Collapses, newest first:
 *   - reactions to one message within 24 hours of the newest: "Maya Chen and 2
 *     others reacted to your message in #design";
 *   - one person's mentions of you in one thread: "Jonas Weber mentioned you 3
 *     times in #engineering";
 *   - one person's docs shared with you within 24 hours of the newest: "Jonas
 *     Weber shared 6 docs with you" (STEP4 #6: the demo's Inbox was twelve
 *     rows saying the same thing).
 * Everything else is its own row. `keyOf` names an item (activityKey).
 */
export function aggregate(items: UnifiedActivityItem[], keyOf: (item: UnifiedActivityItem) => string): FeedEntry[] {
  const out: FeedEntry[] = []
  const reactionRow = new Map<string, FeedEntry>()
  const mentionRow = new Map<string, FeedEntry>()
  const shareRow = new Map<string, FeedEntry>()
  for (const item of items) {
    const by = sharer(item)
    if (by) {
      const row = shareRow.get(by)
      if (row && Math.abs(Date.parse(row.item.time) - Date.parse(item.time)) <= DAY_MS) {
        row.others.push(item)
        row.collapsed = "shares"
        continue
      }
      const entry: FeedEntry = { key: keyOf(item), item, others: [] }
      shareRow.set(by, entry)
      out.push(entry)
      continue
    }
    if (item.activity_type === "REACTION") {
      const target = reactionTarget(item)
      const row = target ? reactionRow.get(target) : undefined
      if (row && Math.abs(Date.parse(row.item.time) - Date.parse(item.time)) <= DAY_MS) {
        row.others.push(item)
        row.collapsed = "reactions"
        continue
      }
      const entry: FeedEntry = { key: keyOf(item), item, others: [] }
      if (target) reactionRow.set(target, entry)
      out.push(entry)
      continue
    }
    if (item.activity_type === "MENTION") {
      const thread = mentionThread(item)
      const row = thread ? mentionRow.get(thread) : undefined
      if (row) {
        row.others.push(item)
        row.collapsed = "mentions"
        continue
      }
      const entry: FeedEntry = { key: keyOf(item), item, others: [] }
      if (thread) mentionRow.set(thread, entry)
      out.push(entry)
      continue
    }
    out.push({ key: keyOf(item), item, others: [] })
  }
  return out
}

/** The verb of a collapsed row. */
export function collapsedVerb(entry: FeedEntry): string | null {
  if (entry.collapsed === "mentions") return `mentioned you ${entry.others.length + 1} times in`
  return null
}

/** A doc in a fold of shares: its name, where it opens (null when the reader can't open it now), and what they can do there. */
export interface SharedDoc {
  key: string
  title: string
  href: string | null
  level: string
}

/** The docs a fold of shares holds, newest first. Pure. */
export function sharedDocs(entry: FeedEntry, keyOf: (item: UnifiedActivityItem) => string): SharedDoc[] {
  return [entry.item, ...entry.others].map((item) => {
    const n = item.notice
    const open = !!n?.can_open
    return {
      key: keyOf(item),
      title: open ? n?.title || "Untitled" : UNOPENED_PLACE,
      href: open ? noticeHref(n) : null,
      level: levelWord(n?.data?.level),
    }
  })
}

/**
 * A fold of shares in words: the sentence's object ("6 docs", read as
 * "Jonas Weber shared 6 docs with you") and the line under it, the first
 * three names the reader can open and how many more. Pure.
 */
export function sharesWords(entry: FeedEntry): { place: string; preview: string } {
  const all = [entry.item, ...entry.others]
  const names = all.flatMap((i) => (i.notice?.can_open ? [i.notice.title || "Untitled"] : []))
  const shown = names.slice(0, 3)
  const rest = all.length - shown.length
  const preview =
    shown.length === 0 ? "" : rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`
  return { place: `${all.length} docs`, preview }
}

/** Distinct other people in a collapsed reactions row. */
export function othersCount(entry: FeedEntry): number {
  const first = entry.item.reaction?.reaction_added_by?.user_uuid
  const ids = new Set(entry.others.map((o) => o.reaction?.reaction_added_by?.user_uuid).filter((id) => id && id !== first))
  return ids.size
}

export type DayGroup = "Today" | "Yesterday" | "Earlier this week" | "Older"

/** The day header an item sits under, by the device's own day. */
export function dayGroupOf(at: string, now = new Date()): DayGroup {
  const t = new Date(at)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const d = start.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  if (d <= 0) return "Today"
  if (d <= DAY_MS) return "Yesterday"
  if (d < 7 * DAY_MS) return "Earlier this week"
  return "Older"
}

/**
 * A row's time under its day header: what the header has not already said.
 * Under "Yesterday" every row read "Yesterday"; it says "4:12 PM" now, a
 * weekday under "Earlier this week" and the date under "Older". Pure.
 */
export function timeUnderDay(at: string, now = new Date()): string {
  const t = new Date(at)
  if (Number.isNaN(t.getTime())) return ""
  const group = dayGroupOf(at, now)
  if (group === "Today" || group === "Yesterday") return clockTime(t)
  if (group === "Earlier this week") return format(t, "EEE")
  return shortDate(t, now)
}

export type PriorityGroup = "Needs a reply" | "Due soon" | "From agents"

/** Priority's groups, in place of day headers. */
export function priorityGroupOf(item: UnifiedActivityItem): PriorityGroup {
  if (item.actor_kind === "agent") return "From agents"
  if (item.mention?.mention_task || item.comment?.comment_task) return "Due soon"
  return "Needs a reply"
}

export const PRIORITY_GROUP_ORDER: PriorityGroup[] = ["Needs a reply", "Due soon", "From agents"]

export interface PreviewPart {
  text: string
  /** A mention chip: "me" for the reader, "other" for anybody else. */
  mention?: "me" | "other"
}

/**
 * The preview line's parts: text, and mention chips. The reader's own mention
 * becomes "@You" (the brand-muted chip); anybody else's stays their name in a
 * neutral chip. The raw HTML is never rendered.
 */
export function previewParts(html: string, meId: string | undefined): PreviewPart[] {
  const parts: PreviewPart[] = []
  const re = /<span[^>]*data-type="mention"[^>]*>([\s\S]*?)<\/span>/g
  let last = 0
  const pushText = (raw: string) => {
    const text = decode(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ")
    if (text.trim()) parts.push({ text })
  }
  for (let m = re.exec(html); m; m = re.exec(html)) {
    pushText(html.slice(last, m.index))
    const id = /data-id="([^"@]+)/.exec(m[0])?.[1]
    const label = decode(m[1].replace(/<[^>]*>/g, "")).trim()
    parts.push(meId && id === meId ? { text: "@You", mention: "me" } : { text: label.startsWith("@") ? label : `@${label}`, mention: "other" })
    last = re.lastIndex
  }
  pushText(html.slice(last))
  if (parts[0] && !parts[0].mention) parts[0] = { text: parts[0].text.trimStart() }
  return parts
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}
