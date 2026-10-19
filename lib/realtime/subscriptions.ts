import { keyOf, type ConversationRef } from "@/lib/conversation/types"
import type { RealtimeSubscriptions } from "@/lib/realtime/types"

/**
 * Realtime Subscriptions by conversation (chat A1, PROGRAM.md §4.2 #26). The
 * connection holds the topics the member's settings name (/config/mqttConfig),
 * and takes or lets go of one as a Conversation_Access says
 * (lib/mqtt/conversationAccess, hooks/useMqttConnection). Topics are
 * encrypted, so the settings also name each conversation's by its key
 * (conversation_topics, keyed as keyOf keys it).
 *
 * A surface showing a conversation subscribes to it, and lets go when it goes;
 * each conversation is counted, so two surfaces on one hold it once. A
 * conversation the settings don't name (one added while the connection was
 * down, whose Conversation_Access never came) has the settings asked for
 * again, once while it's held: the connection then takes its topics without
 * reconnecting. Settings from a server that doesn't name conversations ask
 * for nothing.
 */
export interface SubscriptionDeps {
  /** Whether the settings name this conversation; undefined when they name none (an older server, or none yet). */
  names(key: string): boolean | undefined
  /** Asks for the settings again. */
  refresh(): void
}

export interface CountedSubscriptions extends RealtimeSubscriptions {
  /** How many surfaces hold a conversation. */
  held(ref: ConversationRef): number
}

export function createRealtimeSubscriptions(deps: SubscriptionDeps): CountedSubscriptions {
  const counts = new Map<string, number>()
  const asked = new Set<string>()
  return {
    subscribe(ref) {
      const key = keyOf(ref)
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (deps.names(key) === false && !asked.has(key)) {
        asked.add(key)
        deps.refresh()
      }
    },
    unsubscribe(ref) {
      const key = keyOf(ref)
      const n = (counts.get(key) ?? 0) - 1
      if (n > 0) {
        counts.set(key, n)
        return
      }
      counts.delete(key)
      asked.delete(key)
    },
    held(ref) {
      return counts.get(keyOf(ref)) ?? 0
    },
  }
}
