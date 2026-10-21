import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { chatRef, route, type ConversationPlace } from "@/lib/conversation/route"
import { isThreadsKey, CHAT_THREADS_PATH, THREADS_UNREAD_KEY } from "@/lib/conversation/threadsKey"
import { appMutate, patchCached } from "@/lib/swrMutate"

export { THREADS_UNREAD_KEY }
import { panelTargetOf, type PanelTarget } from "@/lib/activity/panelTarget"
import { displayNameOf } from "@/lib/personName"

/**
 * Threads you follow (chat P2, business/ChatThread): a channel's, a DM's or a
 * group's thread is followed by everyone who takes part in it (wrote its root,
 * replied, was mentioned) unless they turned it off, and by anyone who chose
 * to follow it. The Inbox's Threads tab lists them, unread first; a reply
 * makes a thread unread for everyone following it but its writer. Read and
 * changed at /chat-threads.
 *
 * Only the Inbox's Threads tab and the thread panels reach this file: never
 * services/endPoints.ts, which every route's first load carries.
 */

/** Someone as a thread names them. */
export interface ThreadPerson {
  user_uuid: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string
  is_bot?: boolean
}

/** One reply, as a thread's row shows it. */
export interface ThreadReply {
  id: string
  html: string
  created_at?: string
  by?: ThreadPerson
}

/** One of the threads someone follows. */
export interface FollowedThread {
  /** Its root message's id, which is the thread's. */
  root: string
  conversation: { kind: "channel" | "dm" | "group"; id: string }
  /** The conversation as the row names it: a channel's or a named group's name, a DM's or group's first few people. */
  place: { name?: string; people?: ThreadPerson[]; count?: number }
  message: { html: string; by?: ThreadPerson; created_at?: string; files?: number }
  /** Live replies. */
  replies: number
  /** Replies since the reader last read it, from others; new_more past the latest read ("20+"). */
  new: number
  new_more?: boolean
  /** Its newest replies, newest first. */
  latest: ThreadReply[]
  last_reply_at?: string
  unread: boolean
  /** The reader's own choice: auto (while taking part), on or off. */
  follow: "auto" | "on" | "off"
}

/** A page of the threads someone follows, and how many of all of them are unread. */
export interface ThreadsPage {
  threads: FollowedThread[]
  /** Where the next page starts; absent for none. */
  next?: number
  unread: number
}

/** The key a page of threads is cached under, from offset. Pure. */
export function threadsPageKey(offset = 0): string {
  return offset > 0 ? `${CHAT_THREADS_PATH}?offset=${offset}` : CHAT_THREADS_PATH
}

/**
 * Marks every thread the reader follows read: at once in the tab and its count
 * (the cached first page and count), then on the server, whose answer they
 * read again. Answers how many were unread.
 */
export async function readAllThreads(): Promise<number> {
  patchCached<{ data?: ThreadsPage }>(CHAT_THREADS_PATH, (env) => (env?.data ? { ...env, data: withAllRead(env.data) } : env))
  patchCached<{ data?: { unread?: number } }>(THREADS_UNREAD_KEY, (env) => (env?.data?.unread ? { ...env, data: { unread: 0 } } : env))
  try {
    const res = await axiosInstance.post<{ data: { read: number } }>(`${CHAT_THREADS_PATH}/read-all`, {}, OWN_ERRORS)
    return res.data.data?.read ?? 0
  } finally {
    void appMutate(isThreadsKey)
  }
}

/** Where a thread opens: its conversation, at its root, with the thread. Null for a DM while the reader isn't known. Pure. */
function threadPlace(t: Pick<FollowedThread, "root" | "conversation">, viewer: string | null | undefined): ConversationPlace | null {
  const c = t.conversation.kind === "channel" ? { kind: "channel" as const, id: t.conversation.id } : chatRef(t.conversation.id, viewer)
  return c ? { conversation: c, message: t.root } : null
}

/** The page a thread opens at, as a link. Pure. */
export function threadHref(t: Pick<FollowedThread, "root" | "conversation">, viewer: string | null | undefined): string | null {
  const place = threadPlace(t, viewer)
  return place ? route(place) : null
}

/** Where a thread opens beside the Inbox (the reading pane). Pure. */
export function threadTarget(t: Pick<FollowedThread, "root" | "conversation">, viewer: string | null | undefined): PanelTarget | null {
  return panelTargetOf(threadHref(t, viewer), viewer)
}

/** "You" for the reader, else the person's name. Pure. */
export function nameFor(p: ThreadPerson | undefined, viewer: string | null | undefined): string {
  if (!p) return "Someone"
  if (viewer && p.user_uuid === viewer) return "You"
  return displayNameOf(p) || "Someone"
}

/** "Ada and Ben", "Ada, Ben and Cy", "Ada, Ben and 3 others". Pure. */
function people(names: string[], more: number): string {
  if (more > 0) return `${names.join(", ")} and ${more} ${more === 1 ? "other" : "others"}`
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/**
 * The conversation a thread is in, as its row names it: "#launch"; a DM's
 * "your DM" when the root's author is the person beside you, else "your DM
 * with Jonas Weber"; a group's name, or its people other than you. Pure.
 */
export function placeOf(t: Pick<FollowedThread, "conversation" | "place" | "message">, viewer: string | null | undefined): string {
  const { kind } = t.conversation
  if (kind === "channel") return t.place.name ? `#${t.place.name}` : "a channel"
  const others = (t.place.people ?? []).filter((p) => p.user_uuid !== viewer)
  if (kind === "dm") {
    const other = others[0]
    if (!other || other.user_uuid === t.message.by?.user_uuid) return "your DM"
    return `your DM with ${displayNameOf(other) || "someone"}`
  }
  if (t.place.name) return t.place.name
  const names = others.map((p) => displayNameOf(p) || "someone")
  // The count includes the reader; the names shown don't.
  const total = Math.max((t.place.count ?? 0) - 1, names.length)
  return people(names, total - names.length) || "a group"
}

/** "1 reply", "12 replies". Pure. */
export function repliesWords(n: number): string {
  return n === 1 ? "1 reply" : `${n} replies`
}

/** "3 new", "20+ new", or "" for none. Pure. */
export function newWords(t: Pick<FollowedThread, "new" | "new_more">): string {
  if (t.new <= 0) return ""
  return `${t.new}${t.new_more ? "+" : ""} new`
}

/** A page with one thread read (or unread), as the server will answer it after. Pure. */
export function withRead(page: ThreadsPage, root: string, read: boolean): ThreadsPage {
  let changed = 0
  const threads = page.threads.map((t) => {
    if (t.root !== root || t.unread === !read) return t
    changed += read ? -1 : 1
    return { ...t, unread: !read, new: read ? 0 : Math.max(t.new, 1) }
  })
  return changed === 0 ? page : { ...page, threads, unread: Math.max(0, page.unread + changed) }
}

/** A page with every thread read. Pure. */
export function withAllRead(page: ThreadsPage): ThreadsPage {
  if (page.unread === 0 && page.threads.every((t) => !t.unread)) return page
  return { ...page, unread: 0, threads: page.threads.map((t) => (t.unread ? { ...t, unread: false, new: 0 } : t)) }
}
