/**
 * Realtime Subscriptions: every conversation a person can read streams live,
 * whenever they joined it (chat programme, PROGRAM.md §4.2 #26 and CH9; A1
 * builds them, with W0-B's fixes as their floor).
 *
 * What this names is in pieces today, one per fix:
 *   - a conversation added to or dropped from someone arrives on their own
 *     topic as Conversation_Access (lib/mqtt/conversationAccess), and the
 *     connection takes or lets go of its topic without reconnecting
 *     (hooks/useMqttConnection);
 *   - each tab has a client id of its own (lib/mqtt/tabClientId);
 *   - a topic the broker refused is asked for again (lib/mqtt/subscriptionRetry),
 *     and a dropped connection retries for ever, further apart
 *     (lib/mqtt/reconnectDelay).
 * A1 puts them behind this one interface, by conversation rather than by topic,
 * and resyncs a conversation's list from its newest message after any gap.
 */

import type { ConversationRef } from '@/lib/conversation/types'

/** The live connection, as a conversation's surfaces use it. */
export interface RealtimeSubscriptions {
  /** Streams a conversation from now on, on the open connection. */
  subscribe(ref: ConversationRef): void
  /** Stops streaming it, unless another surface still wants it. */
  unsubscribe(ref: ConversationRef): void
}
