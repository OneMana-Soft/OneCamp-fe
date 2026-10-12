/**
 * notificationOnScreen: whether a push is about what the reader has on screen,
 * so it needn't interrupt them.
 *
 * Compared by conversation and thread, never by path (TN-BUG-9). A channel
 * push routes to its post (/app/channel/<ch>/<post>) while the channel open on
 * a computer is /app/channel/<ch> (a thread there opens in the panel), so the
 * foreground handler's path compare raised a preview for every message in the
 * channel being read, and for every reply in the thread open beside it.
 *
 * A new message, a call or a reaction in a conversation is on screen when that
 * conversation is: the page's, or one in a split pane beside it. A reply in a
 * thread, or a reaction to a reply, is on screen when that thread is open: in
 * the panel on a computer, as the page on a phone. Whether the window has the
 * reader's attention is the caller's to add (the in-app preview only shows on
 * a visible page; a desktop notice also wants focus). Pure.
 */
import { chatRouteSegment, type PushNotificationData } from "@/lib/utils/notificationRoute"

/** What the reader has on screen. */
export interface OnScreen {
  /** Conversations in view: "channel:<uuid>", "dm:<the other person's uuid>" or "group:<group id>". */
  conversations: string[]
  /** The open thread's root post or message uuid, if one is open. */
  thread: string | null
}

/** A split pane beside the page (lib/split), as far as this needs it. */
interface PaneLike {
  kind: string
  id: string
}

const PANE_CONVERSATION: Record<string, string> = { channel: "channel", chat: "dm", group: "group" }

/**
 * What a page shows: its path (/app/channel/<ch>, /app/chat/<person>,
 * /app/chat/group/<grp>, each with a thread after it on a phone), the panes
 * beside it, and the thread open in the panel.
 */
export function onScreenFrom(pathname: string, beside?: { panes?: PaneLike[]; openThread?: string | null }): OnScreen {
  const p = pathname.split(/[?#]/)[0].split("/").filter(Boolean)
  let conversation: string | null = null
  let thread: string | null = null
  if (p[0] === "app" && p[1] === "channel" && p[2]) [conversation, thread] = [`channel:${p[2]}`, p[3] || null]
  else if (p[0] === "app" && p[1] === "chat" && p[2] === "group" && p[3]) [conversation, thread] = [`group:${p[3]}`, p[4] || null]
  else if (p[0] === "app" && p[1] === "chat" && p[2] && p[2] !== "group") [conversation, thread] = [`dm:${p[2]}`, p[3] || null]
  const conversations = thread || !conversation ? [] : [conversation]
  for (const pane of beside?.panes ?? []) {
    const kind = PANE_CONVERSATION[pane.kind]
    if (kind && pane.id) conversations.push(`${kind}:${pane.id}`)
  }
  return { conversations, thread: thread || beside?.openThread || null }
}

/** The conversation a push is about, named as onScreenFrom names one; null for anything else. */
export function pushConversation(data: PushNotificationData | null | undefined, selfUUID?: string | null): string | null {
  const type = data?.type || ""
  const id = (data?.type_id || "").trim()
  if (!id) return null
  if (type === "chat" || type === "chat_reaction" || type === "chat_comment" || type === "chat_comment_reaction") {
    const segment = chatRouteSegment(id, selfUUID || undefined)
    if (!segment) return null
    return segment.startsWith("group/") ? `group:${segment.slice(6)}` : `dm:${segment}`
  }
  if (type === "channel" || type === "post_comment" || type === "channel_call") return `channel:${id}`
  return null
}

/** Kinds that happen in a thread: on screen only while that thread is open. */
const IN_A_THREAD = new Set(["post_comment", "chat_comment", "chat_comment_reaction"])

/** Whether a push is about what is on screen. */
export function pushIsOnScreen(data: PushNotificationData | null | undefined, screen: OnScreen, selfUUID?: string | null): boolean {
  if (IN_A_THREAD.has(data?.type || "")) {
    const thread = (data?.thread_id || "").trim()
    return !!thread && thread === screen.thread
  }
  const conversation = pushConversation(data, selfUUID)
  return !!conversation && screen.conversations.includes(conversation)
}
