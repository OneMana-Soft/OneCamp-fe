import { displayNameOf } from "@/lib/personName"
/**
 * "What needs me now" as data (hub.md H8, H9): one row model for every kind,
 * grouped in a fixed order and capped, so the section and its tests agree.
 *
 *   agent  an agent asks to do something for you (an approval);
 *   reply  a mention or a DM waiting on you;
 *   due    a task overdue or due today;
 *   email  a Gmail thread the AI marks as needing a reply.
 *
 * Pure: the section (NeedsMeSection) draws it, the hook (useHomeNeeds) and the
 * AI's attention list fill it.
 */
import type { StatusKind } from "@/components/ui/graphics/glyphs"
import type { UnifiedActivityItem } from "@/types/activity"
import type { TaskInfoInterface } from "@/types/task"
import type { UserDMInterface } from "@/types/user"
import { collapseEchoes } from "@/lib/activity/feedPages"

export type NeedsKind = "agent" | "reply" | "due" | "email"

export const NEEDS_ORDER: NeedsKind[] = ["agent", "reply", "due", "email"]
export const NEEDS_LABEL: Record<NeedsKind, string> = {
  agent: "Agent requests",
  reply: "Replies",
  due: "Due",
  email: "Email",
}
/** Rows shown before "N more". */
export const NEEDS_CAP = 6

export interface NeedsItem {
  id: string
  kind: NeedsKind
  title: string
  href?: string
  /** The person behind it: a mention's author, a DM partner, an email sender. */
  person?: { id: string; name: string }
  /** A mention's words, one line, with the reader's own mention as "@You". */
  quote?: string
  /** For a task: its status glyph, due phrase and whether it is late. */
  status?: StatusKind
  due?: string
  overdue?: boolean
  project?: { id: string; name: string }
  /** What it belongs to, for an agent request ("in Q4 launch"). */
  context?: string
  /** The thing to act on: a task's uuid and project, a post to reply under, a pending action. */
  taskUuid?: string
  projectUuid?: string
  postUuid?: string
  refId?: string
  /** The time at the row's right edge. */
  when?: string
}

export interface NeedsGroup {
  kind: NeedsKind
  label: string
  items: NeedsItem[]
}

/** Groups in the fixed order, capped at `cap` rows in all; `more` is what the cap left out. */
export function groupNeeds(items: NeedsItem[], cap = NEEDS_CAP): { groups: NeedsGroup[]; more: number; total: number } {
  let room = cap
  const groups: NeedsGroup[] = []
  for (const kind of NEEDS_ORDER) {
    const all = items.filter((i) => i.kind === kind)
    if (all.length === 0 || room <= 0) continue
    const shown = all.slice(0, room)
    room -= shown.length
    groups.push({ kind, label: NEEDS_LABEL[kind], items: shown })
  }
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0)
  return { groups, more: items.length - shownCount, total: items.length }
}

/** Counts per kind, for the summary sentence. */
export function needsCounts(items: NeedsItem[]): Record<NeedsKind, number> & { overdue: number } {
  const c = { agent: 0, reply: 0, due: 0, email: 0, overdue: 0 }
  for (const i of items) {
    c[i.kind]++
    if (i.kind === "due" && i.overdue) c.overdue++
  }
  return c
}

/** Plain words of a message, with the reader's own mention said as "@You". */
export function quoteOf(html: string, selfId?: string): string {
  let s = html
  if (selfId) {
    s = s.replace(new RegExp(`<span[^>]*data-id="${selfId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]*"[^>]*>[^<]*</span>`, "g"), "@You")
  }
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

const WEEK = 7 * 24 * 3600 * 1000

/** Mentions still waiting: not demoted as seen, from the last week, one per thing said. */
export function mentionsToNeeds(items: UnifiedActivityItem[], selfId: string | undefined, now: Date): NeedsItem[] {
  const waiting = collapseEchoes(
    items.filter(
      (a) => a.activity_type === "MENTION" && a.mention && a.priority !== "low" && now.getTime() - Date.parse(a.time) < WEEK,
    ),
  )
  const out: NeedsItem[] = []
  for (const a of waiting) {
    const m = a.mention!
    const post = m.mention_post
    const chat = m.mention_chat
    const by = post?.post_by ?? chat?.chat_from
    if (!by) continue
    const name = displayNameOf(by) || "Someone"
    const first = name.split(/\s+/)[0]
    const place = post?.post_channel?.ch_name ? ` in #${post.post_channel.ch_name}` : chat ? " in a message" : ""
    out.push({
      id: `mention:${post?.post_uuid ?? chat?.chat_uuid ?? a.time}`,
      kind: "reply",
      title: `${first} mentioned you${place}`,
      person: { id: by.user_uuid, name },
      quote: quoteOf(post?.post_text ?? chat?.chat_body_text ?? "", selfId),
      href: post?.post_channel?.ch_uuid ? `/app/channel/${post.post_channel.ch_uuid}/${post.post_uuid}` : undefined,
      postUuid: post?.post_uuid,
      when: a.time,
    })
  }
  return out
}

/** DMs with unread messages: someone is waiting on an answer. */
export function dmsToNeeds(chats: UserDMInterface[], selfId: string | undefined): NeedsItem[] {
  const out: NeedsItem[] = []
  for (const c of chats) {
    if (!c.dm_unread) continue
    const others = (c.dm_participants || []).filter((p) => p.user_uuid !== selfId)
    const who = others[0]
    if (!who) continue
    const name = displayNameOf(who) || "Someone"
    const n = c.dm_unread
    out.push({
      id: `dm:${c.dm_grouping_id}`,
      kind: "reply",
      title: others.length > 1 ? `${name.split(/\s+/)[0]} and ${others.length - 1} more wrote to you` : `${name} wrote to you`,
      person: { id: who.user_uuid, name },
      quote: `${n} unread message${n === 1 ? "" : "s"}`,
      href: others.length > 1 ? `/app/chat/group/${c.dm_grouping_id}` : `/app/chat/${who.user_uuid}`,
    })
  }
  return out
}

const OPEN = (s: string) => !/^(done|cancel)/i.test(s || "")

/** Tasks overdue or due by the end of today, oldest first. */
export function tasksToNeeds(tasks: TaskInfoInterface[], now: Date): NeedsItem[] {
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return tasks
    .filter((t) => t.task_due_date && OPEN(t.task_status) && !t.task_deleted_at?.startsWith("2"))
    .map((t) => ({ t, at: Date.parse(t.task_due_date) }))
    .filter(({ at }) => Number.isFinite(at) && at < endOfDay)
    .sort((a, b) => a.at - b.at)
    .map(({ t, at }) => {
      const overdue = at < startOfDay
      return {
        id: `task:${t.task_uuid}`,
        kind: "due" as const,
        title: t.task_name,
        status: statusOf(t.task_status),
        due: overdue ? `Overdue · ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Due today",
        overdue,
        project: t.task_project?.project_uuid ? { id: t.task_project.project_uuid, name: t.task_project.project_name } : undefined,
        href: `/app/task/${t.task_uuid}`,
        taskUuid: t.task_uuid,
        projectUuid: t.task_project?.project_uuid,
      }
    })
}

export function statusOf(s: string): StatusKind {
  const v = (s || "").toLowerCase().replace(/[\s_-]/g, "")
  if (v.startsWith("inprogress") || v === "progress") return "progress"
  if (v.startsWith("review") || v.startsWith("inreview")) return "review"
  if (v.startsWith("done")) return "done"
  if (v.startsWith("cancel")) return "cancelled"
  if (v.startsWith("backlog")) return "backlog"
  return "todo"
}

/** Two lists of rows as one, the first's rows winning where both name one thing. */
export function mergeNeeds(first: NeedsItem[], second: NeedsItem[]): NeedsItem[] {
  const seen = new Set(first.map((i) => i.id))
  const titles = new Set(first.filter((i) => i.kind === "due").map((i) => i.title.toLowerCase()))
  return [...first, ...second.filter((i) => !seen.has(i.id) && !(i.kind === "due" && titles.has(i.title.toLowerCase())))]
}
