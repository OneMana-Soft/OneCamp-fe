/**
 * The Conversation model's shapes on the web (chat programme, PROGRAM.md §4.2
 * #22, chat A1): a channel, a DM and a group are one ConversationRef, a thread
 * is a ThreadRef in one, and every surface reads one message shape whichever
 * of today's three stacks the message came from. The API names the same kinds
 * (business/Conversation: channel, dm, group, thread).
 *
 * A1 step 1 (this): the exact cursor, the anchor, a list's key and the
 * per-kind adapter (lib/conversation/adapters), over today's endpoints and
 * rows. The stacks' own components and slices still hold the messages; the
 * hosts (components/conversation, store/conversations) stand in front of them
 * until CHAT-A1B moves them in.
 */

import type { BaseMessage } from '@/components/message/baseMessageCard'

/** A conversation. */
export type ConversationRef =
  | { kind: 'channel'; id: string }
  /**
   * A DM: id is its grouping id (both people's ids, sorted, a space between),
   * and other is the person beside you, which today's routes and store key it by.
   */
  | { kind: 'dm'; id: string; other: string }
  /** A group: id is its grouping id. */
  | { kind: 'group'; id: string }

/** A thread: the conversation it is in, and its root message. */
export interface ThreadRef {
  in: ConversationRef
  root: string
}

/** Anything with a list and a composer. */
export type Target = ConversationRef | ThreadRef

/**
 * One message: today's row shape, which a channel's post and a DM's or group's
 * message already read alike (mapPostsResToBaseMessage, mapChatInfoToBaseMessage).
 */
export type Message = BaseMessage

/**
 * An exact place in a conversation's history: a message's time as the server
 * wrote it and its id, so a page that starts beside it never skips another
 * message written in the same second (lib/chat/pageEdge, the server's
 * helpers.PageEdge).
 */
export interface Cursor {
  at: string
  id: string
}

/**
 * Where a conversation opens: at its newest messages, where the reader's
 * unread ones start, or at one message (a link to it, with its thread).
 */
export type Anchor = { at: 'latest' } | { at: 'unread' } | { at: 'message'; id: string }

/** One direction of paging: whether there is more, whether it is being asked for, how to ask. */
export interface PageWay {
  has: boolean
  loading: boolean
  ask(): void
  /** Set when the last page that way failed: ask again (SD-BUG-1). */
  retry?: () => void
}

/** What useConversation answers for a conversation: its list, paged. */
export interface ConversationState<Row = unknown> {
  /** The rows held, oldest first. */
  rows: Row[]
  /**
   * 'loading' before the first answer is in the store and 'error' when it
   * failed: a conversation that couldn't be read never shows as empty (CH12).
   */
  status: 'loading' | 'ready' | 'error'
  /** Asks again. */
  retry(): void
  /** The message a link opened it at. */
  anchor?: string
  older: PageWay
  newer: PageWay
  /** Jump to latest: leaves a link, else the latest page, and follows the end. */
  toLatest(): void
}

/** Whether a target is a thread. Pure. */
export function isThread(target: Target): target is ThreadRef {
  return 'root' in target
}

/**
 * The one key a conversation or thread is held by, whichever surface shows it:
 * "channel:<uuid>", "dm:<grouping id>", "group:<grouping id>", and a thread's
 * "<its conversation's key>/thread:<root>". The server names a conversation's
 * live topics by the same key (business/Mqtt conversationKey). Pure.
 */
export function keyOf(target: Target): string {
  if (isThread(target)) return `${keyOf(target.in)}/thread:${target.root}`
  return `${target.kind}:${target.id}`
}
