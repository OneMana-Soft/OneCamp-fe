import type { CampHue } from "@/lib/campHue"
import { areaHue, type Area } from "@/lib/areas"
import { app_board_path, app_calendar_path, app_channel_path, app_chat_path, app_doc_path, app_project_path, app_task_path, app_team_path, app_user } from "@/types/paths"
import { shortDate } from "@/lib/utils/date/shortDate"
import { dayDate } from "@/lib/utils/timeZone"
import type { DocNodeKind } from "@/types/docGraph"

/**
 * The work graph (DG5) as the web app reads it: what a thing is connected to
 * (GET /graph/connected) and how two things connect (GET /graph/path). The
 * server decides every node as the reader and drops a path through anything
 * hidden whole, so nothing here filters or guesses; this module words and
 * colours what came back. Pure, so it is tested without a browser.
 */

export const GRAPH_PATHS = { connected: "/graph/connected", path: "/graph/path" } as const

export type GraphKind = "doc" | "task" | "project" | "person" | "board" | "channel" | "message" | "chat" | "team" | "comment" | "memory" | "event"

/** The kinds a panel opens from: a doc, a task, a project, a channel, a person. */
export type GraphRootKind = "doc" | "task" | "project" | "channel" | "person"

export interface GraphHop {
  rel: string
  kind: GraphKind
  id: string
  title: string
  data?: Record<string, unknown>
}

export interface GraphItem extends GraphHop {
  depth: number
  path: GraphHop[]
}

export interface GraphGroup {
  kind: GraphKind
  items: GraphItem[]
  more: boolean
}

export interface Connected {
  root: GraphHop
  depth: number
  groups: GraphGroup[]
}

export interface GraphPaths {
  from: GraphHop
  to: GraphHop
  paths: { hops: GraphHop[] }[]
}

/** The address of a thing's connections. */
export function connectedKey(kind: GraphRootKind, id: string, depth: 1 | 2): string {
  if (!id) return ""
  return `${GRAPH_PATHS.connected}?${new URLSearchParams({ kind, uuid: id, depth: String(depth) })}`
}

/** The address of the ways one thing connects to another. */
export function pathKey(from: { kind: GraphKind; id: string }, to: { kind: GraphKind; id: string } | null): string {
  if (!from.id || !to?.id) return ""
  return `${GRAPH_PATHS.path}?${new URLSearchParams({ from_kind: from.kind, from: from.id, to_kind: to.kind, to: to.id })}`
}

interface KindMeta {
  one: string
  many: string
  /** The area it belongs to (lib/areas), or none: people and teams aren't an area. */
  area: Area | null
}

const KINDS: Record<GraphKind, KindMeta> = {
  doc: { one: "Doc", many: "Docs", area: "docs" },
  task: { one: "Task", many: "Tasks", area: "projects" },
  project: { one: "Project", many: "Projects", area: "projects" },
  person: { one: "Person", many: "People", area: null },
  board: { one: "Whiteboard", many: "Whiteboards", area: "projects" },
  channel: { one: "Channel", many: "Channels", area: "chat" },
  message: { one: "Message", many: "Messages", area: "chat" },
  chat: { one: "Direct message", many: "Direct messages", area: "chat" },
  team: { one: "Team", many: "Teams", area: null },
  comment: { one: "Comment", many: "Comments", area: null },
  memory: { one: "Note", many: "Notes", area: "agents" },
  event: { one: "Meeting", many: "Meetings", area: "calendar" },
}

export const kindLabel = (k: GraphKind, n = 1) => (n === 1 ? KINDS[k]?.one : KINDS[k]?.many) ?? "Item"

const NODE_LABEL: Record<DocNodeKind, string> = { folder: "Folder", file: "File", link: "Link" }

/**
 * What a doc node is when it isn't a page (docs F1), as the server's chip says
 * it (data.node_kind): a folder, a file or a link; null for a page and for
 * anything that isn't a doc.
 */
export function nodeKindOf(h: Pick<GraphHop, "kind" | "data">): DocNodeKind | null {
  const k = h.kind === "doc" ? h.data?.node_kind : undefined
  return k === "folder" || k === "file" || k === "link" ? k : null
}

/** What a row calls its thing: "Folder", "File" or "Link" for a doc that is one, else its kind's word ("Doc", "Task"). */
export const labelOf = (h: Pick<GraphHop, "kind" | "data">): string => {
  const node = nodeKindOf(h)
  return node ? NODE_LABEL[node] : kindLabel(h.kind)
}

/** A kind's mark: its area's hue (design v3.1: colour names an area), the agents' indigo, or neutral ink. */
export type KindHue = CampHue | "agent" | "ink"

export const kindHue = (k: GraphKind): KindHue => {
  const area = KINDS[k]?.area
  return area ? areaHue(area) : "ink"
}

/** The order groups are shown in. */
export const GROUP_ORDER: GraphKind[] = ["doc", "task", "project", "event", "person", "channel", "message", "chat", "board", "team", "comment", "memory"]

/**
 * What a hop's thing is to the thing before it, as a row's reason says it
 * ("Links here", "Assignee"). One line per relationship of the server's
 * allow-list (domain/WorkGraph Edges).
 */
const REASON: Record<string, string> = {
  linked_from: "Links here",
  links_to: "Linked from here",
  mentioned_by: "Mentions this",
  parent: "Parent page",
  subpage: "Subpage",
  // The doc tree's edge where a folder, a file or a link is at one end (docs F1).
  in_folder: "Its folder",
  contains: "In this folder",
  holds: "In this page",
  shared_in: "Shared in a message",
  created_by: "Created it",
  owned_by: "Owns it",
  comment: "Comment",
  links_board: "Linked whiteboard",
  in_project: "Its project",
  assigned_to: "Assignee",
  blocked_by: "Blocks this",
  blocks: "Waits on this",
  subtask_of: "Parent task",
  subtask: "Subtask",
  task: "Task in it",
  in_team: "Its team",
  memory: "Note on it",
  shares: "Shared doc",
  posted_by: "Posted it",
  in_channel: "Posted in",
  message: "Message here",
  created: "Created by them",
  owns: "Owned by them",
  assigned: "Assigned to them",
  posted: "Their message",
  project: "Project",
  on: "On",
  about: "About",
  // A meeting (DG13): its people, its calendar, and theirs.
  organised_by: "Organiser",
  with: "Invited",
  on_calendar_of: "Its calendar",
  meeting: "On its calendar",
  organised: "Organised by them",
  invited_to: "Invites them",
}

/**
 * A relationship worded for the kind it leads to, where the kind says more
 * than the relationship: a meeting whose notes link a doc discussed it.
 */
const BY_KIND: Record<string, { reason: string; verb: string }> = {
  "linked_from event": { reason: "Discussed this", verb: "was discussed in" },
}

export const reasonOf = (rel: string, kind?: GraphKind) => BY_KIND[`${rel} ${kind}`]?.reason ?? REASON[rel] ?? "Connected"

/**
 * A two-step row's reason where its two steps say more together than the
 * last alone, keyed by both relationships: what the root's own folder
 * contains shares that folder with the root (docs F1).
 */
const PAIR_REASON: Record<string, string> = {
  "in_folder contains": "In the same folder",
}

/** The verb between two things on a path: "Plan · is linked from · Record the film". */
const VERB: Record<string, string> = {
  linked_from: "is linked from",
  links_to: "links to",
  mentioned_by: "is mentioned in",
  parent: "sits under",
  subpage: "holds",
  in_folder: "is in the folder",
  contains: "contains",
  holds: "holds",
  shared_in: "was shared in",
  created_by: "was created by",
  owned_by: "is owned by",
  comment: "has the comment",
  links_board: "links",
  in_project: "is in",
  assigned_to: "is assigned to",
  blocked_by: "is blocked by",
  blocks: "blocks",
  subtask_of: "is a subtask of",
  subtask: "has the subtask",
  task: "has the task",
  in_team: "belongs to",
  memory: "has the note",
  shares: "shares",
  posted_by: "was posted by",
  in_channel: "was posted in",
  message: "has the message",
  created: "created",
  owns: "owns",
  assigned: "is assigned",
  posted: "posted",
  project: "runs",
  on: "is on",
  about: "is about",
  organised_by: "is organised by",
  with: "is with",
  on_calendar_of: "is on the calendar of",
  meeting: "has the meeting",
  organised: "organised",
  invited_to: "is invited to",
}

/** The verb before a hop to a thing of kind: "Plan · was discussed in · Weekly sync". */
export const verbOf = (rel: string, kind?: GraphKind) => BY_KIND[`${rel} ${kind}`]?.verb ?? VERB[rel] ?? "connects to"

/** The day a meeting starts, as a row says it ("26 Oct"); "" when the server sent none. */
export function meetingDay(data: GraphHop["data"], now: Date = new Date()): string {
  const start = data?.start as { at?: unknown; date?: unknown } | undefined
  const d = typeof start?.at === "string" ? new Date(start.at) : typeof start?.date === "string" ? dayDate(start.date) : undefined
  return d && !Number.isNaN(d.getTime()) ? shortDate(d, now) : ""
}

/** A thing's name as a row shows it: a message's channel when it has no words. */
export function titleOf(h: Pick<GraphHop, "kind" | "title" | "data">): string {
  const t = (h.title ?? "").trim()
  if (t) return h.kind === "channel" ? `#${t}` : t
  if (h.kind === "message" && typeof h.data?.channel_name === "string") return `A message in #${h.data.channel_name}`
  if (h.kind === "chat") {
    // A group's path is /app/chat/group/… (helpers.ChatPath): say so, so it
    // isn't taken for a one-to-one message.
    const what = typeof h.data?.path === "string" && h.data.path.startsWith("/app/chat/group/") ? "A group message" : "A direct message"
    return typeof h.data?.by_name === "string" ? `${what} from ${h.data.by_name}` : what
  }
  return `Untitled ${labelOf(h).toLowerCase()}`
}

/**
 * The line under a row: why it's here. One hop: its reason. Two: the reason
 * (the pair's, PAIR_REASON, when it has one) and the thing in between ("Its
 * project · via Record the film").
 */
export function whyOf(item: GraphItem): string {
  const first = item.path[0]
  if (!first) return ""
  if (item.path.length === 1) {
    // A direct message's title already names who wrote it; say it once.
    const named = item.kind === "chat" && !(item.title ?? "").trim()
    const by = (item.kind === "message" || item.kind === "chat") && !named && typeof item.data?.by_name === "string" ? ` · ${item.data.by_name}` : ""
    const day = item.kind === "event" ? meetingDay(item.data) : ""
    return reasonOf(first.rel, item.kind) + by + (day ? ` · ${day}` : "")
  }
  const via = item.path[item.path.length - 2]
  const rel = item.path[item.path.length - 1].rel
  return `${PAIR_REASON[`${via.rel} ${rel}`] ?? reasonOf(rel, item.kind)} · via ${titleOf(via)}`
}

/** A path as one sentence, for screen readers and the copy button. */
export function sentenceOf(from: GraphHop, hops: GraphHop[]): string {
  let prev = titleOf(from)
  const parts = [prev]
  for (const h of hops) {
    prev = titleOf(h)
    parts.push(verbOf(h.rel, h.kind), prev)
  }
  return parts.join(" ")
}

/** A server-written address when it opens a direct message, and nowhere else; "" otherwise. */
function chatPath(path: unknown): string {
  return typeof path === "string" && path.startsWith(`${app_chat_path}/`) ? path : ""
}

/** Where a thing opens; "" for one that opens nowhere of its own (a note). */
export function hrefOf(h: Pick<GraphHop, "kind" | "id" | "data">): string {
  const id = encodeURIComponent(h.id)
  switch (h.kind) {
    case "doc":
      return `${app_doc_path}/${id}`
    case "task":
      return `${app_task_path}/${id}`
    case "project":
      return `${app_project_path}/${id}`
    case "person":
      return `${app_user}/${id}`
    case "board":
      return `${app_board_path}/${id}`
    case "channel":
      return `${app_channel_path}/${id}`
    case "team":
      return `${app_team_path}/${id}`
    case "event":
      return `${app_calendar_path}/event/${id}`
    case "message": {
      const ch = typeof h.data?.channel_id === "string" ? h.data.channel_id : ""
      return ch ? `${app_channel_path}/${encodeURIComponent(ch)}/${id}` : ""
    }
    case "chat":
      // The server writes where a direct message opens for the reader (helpers.ChatPath).
      return chatPath(h.data?.path)
    case "comment": {
      if (h.data?.on_kind === "chat") return chatPath(h.data?.on_path)
      const on = h.data?.on_kind as GraphKind | undefined
      const onId = typeof h.data?.on_id === "string" ? h.data.on_id : ""
      return on && onId && on !== "comment" ? hrefOf({ kind: on, id: onId }) : ""
    }
    default:
      return ""
  }
}

/** How many things a Connected answer shows, and whether there are more. */
export function countOf(c: Connected | undefined): { n: number; more: boolean } {
  let n = 0
  let more = false
  for (const g of c?.groups ?? []) {
    n += g.items.length
    more = more || g.more
  }
  return { n, more }
}

/** "3 connected", "12+ connected", "Nothing connected yet". */
export function countLabel(c: Connected | undefined): string {
  const { n, more } = countOf(c)
  if (!n) return "Nothing connected yet"
  return `${n}${more ? "+" : ""} connected`
}

/** The groups in GROUP_ORDER, narrowed to one kind when one is chosen. */
export function groupsIn(c: Connected | undefined, only: GraphKind | "all"): GraphGroup[] {
  const gs = [...(c?.groups ?? [])].sort((a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind))
  return only === "all" ? gs : gs.filter((g) => g.kind === only)
}

/** The next row a key moves to, wrapping, in a list of n rows; at is -1 when no row has focus. */
export function nextIndex(key: string, at: number, n: number): number {
  if (n <= 0) return -1
  switch (key) {
    case "ArrowDown":
      return (at + 1) % n
    case "ArrowUp":
      return at < 0 ? n - 1 : (at - 1 + n) % n
    case "Home":
      return 0
    case "End":
      return n - 1
    default:
      return at
  }
}

/** What a search hit is as a graph thing, or null for one the graph doesn't hold. */
export function graphKindOfSearch(type: string): GraphKind | null {
  switch (type) {
    case "doc":
    case "docs":
      return "doc"
    case "task":
    case "tasks":
      return "task"
    case "project":
    case "projects":
      return "project"
    case "user":
    case "users":
    case "people":
    case "person":
      return "person"
    case "channel":
    case "channels":
      return "channel"
    case "board":
    case "boards":
      return "board"
    default:
      return null
  }
}

/** A thing a search found, as the picker offers it: null for one the graph doesn't hold. */
export interface PickHit {
  kind: GraphKind
  id: string
  title: string
}

const str = (v: unknown) => (typeof v === "string" ? v : "")

/** A global search hit (services/searchService SearchResult) as a pick. */
export function pickOf(r: { type: string } & Record<string, unknown>): PickHit | null {
  const kind = graphKindOfSearch(r.type)
  if (!kind) return null
  const o = (r[r.type] ?? {}) as Record<string, unknown>
  const [id, title] = (() => {
    switch (kind) {
      case "doc":
        return [str(o.doc_uuid), str(o.doc_title)]
      // Search rows name ids two ways (task_id beside task_uuid): take either.
      case "task":
        return [str(o.task_uuid) || str(o.task_id), str(o.task_name)]
      case "project":
        return [str(o.project_uuid) || str(o.project_id), str(o.project_name)]
      case "person":
        return [str(o.user_uuid) || str(o.user_id), str(o.user_full_name) || str(o.user_name)]
      case "channel":
        return [str(o.ch_uuid) || str(o.ch_id), str(o.ch_name)]
      case "board":
        return [str(o.board_uuid), str(o.board_title)]
      default:
        return ["", ""]
    }
  })()
  return id ? { kind, id, title: titleOf({ kind, title, data: undefined }) } : null
}

/** The picks of a page of hits: each thing once, the thing itself left out. */
export function picksOf(page: ReadonlyArray<{ type: string } & Record<string, unknown>> | undefined, self: { kind: GraphKind; id: string }): PickHit[] {
  const seen = new Set<string>([`${self.kind}:${self.id.toLowerCase()}`])
  const out: PickHit[] = []
  for (const r of page ?? []) {
    const p = pickOf(r)
    const key = p && `${p.kind}:${p.id.toLowerCase()}`
    if (p && key && !seen.has(key)) {
      seen.add(key)
      out.push(p)
    }
  }
  return out
}
