import type { ScopedMutator } from "swr"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * A conversation, a project or a team became the member's, or stopped being
 * theirs (Conversation_Access, sent on their own topic).
 *
 * The app holds the topics its settings named when it connected
 * (/config/mqttConfig). A DM or group started, a channel made, joined or added
 * to since wasn't among them, so nothing in it streamed until a reload; one
 * removed from stayed among them. A project made or added to is the same, and
 * so is one taken away, or a team with its projects. A group never changes
 * its id: adding someone opens the group of the new set, which arrives here
 * like any new conversation (chat A9). So:
 *   - the settings are fetched again, and the connection subscribes to what's
 *     new and lets go of what's gone, without reconnecting
 *     (hooks/useMqttConnection);
 *   - the lists that show it are fetched again, so a new one appears with the
 *     message that started it, and one taken away goes.
 */

export type ConversationKind = "channel" | "dm" | "group"
export type AccessKind = ConversationKind | "project" | "team"

export interface ConversationAccess {
  kind: AccessKind
  id: string
  change: "added" | "dropped"
}

/** The event's data, or null when it isn't one this app can act on. */
export function readConversationAccess(data: unknown): ConversationAccess | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  const kinds: AccessKind[] = ["channel", "dm", "group", "project", "team"]
  if (!kinds.includes(d.kind as AccessKind) || typeof d.id !== "string" || !d.id) return null
  if (d.change !== "added" && d.change !== "dropped") return null
  return { kind: d.kind as AccessKind, id: d.id, change: d.change }
}

/** The lists of the member's projects: the sidebar's, their own, a team's. */
const projectLists = (key: string) =>
  key.includes(GetEndpointUrl.SelfProfileSideNav) ||
  key.includes(GetEndpointUrl.GetUserProjectList) ||
  key.includes(GetEndpointUrl.GetTeamProjectList)

/** A project's own reads, for one project or, without an id, for any. */
const projectReads = (key: string, id?: string) =>
  (key.includes(GetEndpointUrl.GetProjectInfo) || key.includes(GetEndpointUrl.GetProjectMembers)) && (!id || key.includes(id))

/** The cached lists a change of this kind shows in. */
function listsShowing(access: ConversationAccess): (key: string) => boolean {
  switch (access.kind) {
    case "channel":
      return (key) =>
        key.includes(GetEndpointUrl.SelfProfileSideNav) ||
        key.includes(GetEndpointUrl.GetUserActiveChannelList) ||
        key.includes(GetEndpointUrl.GetUserArchiveChannelList) ||
        key.includes(GetEndpointUrl.GetAllActiveChannelList) ||
        (key.includes(GetEndpointUrl.ChannelBasicInfo) && key.includes(access.id))
    case "project":
      return (key) => projectLists(key) || projectReads(key, access.id)
    case "team":
      // Its projects go with it. Which they were isn't known here, so every
      // project open asks again, and one taken away says so.
      return (key) =>
        projectLists(key) ||
        key.includes(GetEndpointUrl.GetUserTeamList) ||
        (key.includes(GetEndpointUrl.GetTeamInfo) && key.includes(access.id)) ||
        projectReads(key)
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
}
