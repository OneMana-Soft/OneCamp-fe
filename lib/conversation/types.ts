/**
 * The Conversation model's shapes on the web (chat programme, PROGRAM.md §4.2
 * #22; A1 builds the model): a channel, a DM and a group are one
 * ConversationRef, a thread is a ThreadRef in one, and every surface reads one
 * message shape whichever of today's three stacks the message came from. The
 * API names the same kinds (business/Conversation: channel, dm, group,
 * thread).
 *
 * The package that builds the model owns its final shape: A1 adds the exact
 * cursor, the anchor, drafts and the per-kind adapters here, and moves the
 * message shape in beside them.
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

/** What useConversation answers for a conversation. */
export interface ConversationState {
  /** Oldest first. */
  messages: Message[]
  /**
   * 'loading' before the first answer and 'error' when it failed: a
   * conversation that couldn't be read never shows as empty (CH12).
   */
  status: 'loading' | 'ready' | 'error'
  /** Asks again. */
  retry(): void
}
