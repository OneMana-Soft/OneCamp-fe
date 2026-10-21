/**
 * The conversation service's paths (router/chatConversations.go and the chat
 * packages beside it): /conversations/{kind}/{id}/{rest}, the id escaped (a
 * DM's is both people's ids with a space between). Its own small file, not
 * services/endPoints.ts, which every route's first load carries
 * (app/firstLoad.test.ts): the MQTT handler reads it to name a conversation's
 * pins, and the chat screens to call the service.
 */

/** The service's base path. */
const CONVERSATIONS_PATH = "/conversations"

/** A conversation's path on the service. Pure. */
export function conversationPath(kind: "channel" | "dm" | "group", id: string, rest: string): string {
  return `${CONVERSATIONS_PATH}/${kind}/${encodeURIComponent(id)}/${rest}`
}

/** The key a conversation's pins are read and cached under (chat B25). Pure. */
export function pinsKey(kind: "channel" | "dm" | "group", id: string): string {
  return conversationPath(kind, id, "pins")
}

/** The key where you are in a conversation is read and cached under (chat A3). Pure. */
export function readStateKey(kind: "channel" | "dm" | "group", id: string): string {
  return conversationPath(kind, id, "read-state")
}
