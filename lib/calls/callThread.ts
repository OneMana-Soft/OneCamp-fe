// The call's chat (calls CALLS-3b): the thread of the call's message in its
// conversation, read and written through the call's own surface by everyone
// in the call, members, people let in by its invite and guests alike, while
// the call goes on. What lasts is the thread: the conversation's people find
// it under the call's message afterwards. Pure: who asks, and when.

import { callRefOfRoom } from "@/services/callInviteService"

/** Who asks: a member by the call's id, a guest by the call token they joined with. */
export type CallThreadTarget = { sessionId: string } | { callToken: string }

/** A message in the call's chat: plain text and who wrote it, never anything of the conversation. */
export interface CallChatMessage {
  id: string
  /** Who wrote it: a guest by the name they gave. */
  author: string
  /** The same on one member's replies in this thread, and meaningless outside it; none on a guest's or a relay's. */
  author_key?: string
  /** A guest's message, marked as the call marks guests. */
  guest?: boolean
  text: string
  created_at: string
}

/** The call's chat as the surface answers it (business/Guest CallThread). */
export interface CallThreadRead {
  post: CallChatMessage
  replies: CallChatMessage[]
  /** Whether the reader may write in it. */
  can_reply: boolean
  /** Why not, when the people running the call hold its chat (meet-12): the reader may write once they let everyone again. */
  chat_held?: boolean
  /** What the next poll sends back as its since. */
  latest: string
}

/** How often an open chat asks while the page is in view. */
export const POLL_MS = 5_000
/** Every how many polls one reads the whole chat: edits and deletions don't move since. */
export const FULL_EVERY = 12
/** The longest message the surface takes. */
export const MAX_MESSAGE = 4_000
/**
 * A call's message is written as the call starts, or by the server's repair a
 * minute or so later: until then the chat isn't there yet. It's asked every
 * poll for two minutes, then every 30 s while the panel is open, and never
 * given up on (CHAT-LEAD-3).
 */
export const NOT_YET_FAST_MS = 120_000
export const NOT_YET_SLOW_MS = 30_000

/**
 * The call's chat, or none: a conversation's call has one (its message's
 * thread); a meeting, which is in no conversation, has none. Pure.
 */
export function callThreadTargetOf(o: { room: string; guest: boolean; sessionId?: string; callToken?: string }): CallThreadTarget | undefined {
  const ref = callRefOfRoom(o.room)
  if (!ref || ref.kind === "meeting") return undefined
  if (o.guest) return o.callToken ? { callToken: o.callToken } : undefined
  return o.sessionId ? { sessionId: o.sessionId } : undefined
}

/** A poll's since: none for the first read and every FULL_EVERY-th, else the last read's latest. Pure. */
export function sinceFor(poll: number, last: CallThreadRead | null): string | undefined {
  if (!last || poll % FULL_EVERY === 0) return undefined
  return last.latest
}

/** A message's length as the server counts it: characters, not UTF-16 units, trimmed. Pure. */
export const messageLength = (text: string) => [...text.trim()].length

/** The text as the surface takes it, or why it can't be sent: empty, or too long. Pure. */
export function messageProblem(text: string): string | null {
  if (!text.trim()) return "Write a message first."
  if (messageLength(text) > MAX_MESSAGE) return "Keep messages under 4,000 characters."
  return null
}

/** Whether a chat still waiting for its call's message asks now: every poll at first, then every 30 s. Pure. */
export function asksWhileWaiting(waitingSince: number, lastAsked: number, now: number): boolean {
  return now - waitingSince < NOT_YET_FAST_MS || now - lastAsked >= NOT_YET_SLOW_MS
}
