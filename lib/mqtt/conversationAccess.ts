import type { ScopedMutator } from "swr"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * A conversation became the member's, or stopped being theirs
 * (Conversation_Access, sent on their own topic).
 *
 * The app holds the topics its settings named when it connected
 * (/config/mqttConfig). A DM or group started, a channel made, joined or added
 * to since wasn't among them, so nothing in it streamed until a reload; one
 * removed from stayed among them. A group that took someone in has a new id
 * (its members' hash) that no open app held. So:
 *   - the settings are fetched again, and the connection subscribes to what's
 *     new and lets go of what's gone, without reconnecting
 *     (hooks/useMqttConnection);
 *   - the lists that show conversations are fetched again, so a new one
 *     appears with the message that started it, and one taken away goes;
 *   - a group view open on the old id moves to the new one
 *     (CONVERSATION_MOVED_EVENT).
 */

export type ConversationKind = "channel" | "dm" | "group"

export interface ConversationAccess {
  kind: ConversationKind
  id: string
  change: "added" | "dropped"
  /** The id the conversation had until now, when it changed. */
  previous_id?: string
}

/** A window event: a conversation's id changed, from `from` to `to`. */
export const CONVERSATION_MOVED_EVENT = "conversation-moved"

export interface ConversationMoved {
  kind: ConversationKind
  from: string
  to: string
}

/** The event's data, or null when it isn't one this app can act on. */
export function readConversationAccess(data: unknown): ConversationAccess | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  const kinds: ConversationKind[] = ["channel", "dm", "group"]
  if (!kinds.includes(d.kind as ConversationKind) || typeof d.id !== "string" || !d.id) return null
  if (d.change !== "added" && d.change !== "dropped") return null
  return {
    kind: d.kind as ConversationKind,
    id: d.id,
    change: d.change,
    ...(typeof d.previous_id === "string" && d.previous_id ? { previous_id: d.previous_id } : {}),
  }
}

/** The cached lists a change of this kind of conversation shows in. */
function listsShowing(access: ConversationAccess): (key: string) => boolean {
  if (access.kind === "channel") {
    return (key) =>
      key.includes(GetEndpointUrl.SelfProfileSideNav) ||
      key.includes(GetEndpointUrl.GetUserActiveChannelList) ||
      key.includes(GetEndpointUrl.GetUserArchiveChannelList) ||
      key.includes(GetEndpointUrl.GetAllActiveChannelList) ||
      (key.includes(GetEndpointUrl.ChannelBasicInfo) && key.includes(access.id))
  }
  return (key) => key.includes(GetEndpointUrl.SelfProfileSideNav) || key.includes(GetEndpointUrl.GetUserLatestChatList)
}

export function applyConversationAccess(
  access: ConversationAccess,
  deps: { refreshTopics: () => void; mutate: ScopedMutator },
): void {
  deps.refreshTopics()
  const showing = listsShowing(access)
  // The key alone: each list is fetched again and keeps what it shows until
  // the answer lands.
  void deps.mutate((key: unknown) => typeof key === "string" && showing(key))
  if (access.previous_id && typeof window !== "undefined") {
    const moved: ConversationMoved = { kind: access.kind, from: access.previous_id, to: access.id }
    window.dispatchEvent(new CustomEvent(CONVERSATION_MOVED_EVENT, { detail: moved }))
  }
}
