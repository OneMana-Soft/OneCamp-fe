// A DM or a group chat, and which one is on screen.
//
// The conversation on screen has nothing unread: you're reading it. The live
// handler never counts a message that lands in it (hooks/useChatMessageHandlers),
// and a list the server answered just before the conversation was marked read
// must not bring the old count back (withOpenRead), which it did on a link
// straight into a chat.

import { getGroupingId } from "@/lib/utils/getGroupingId"
import { app_chat_path, app_grp_chat_path } from "@/types/paths"

/** A conversation: a DM, by the other person, or a group chat, by its id. */
export type ChatTarget = { kind: "dm"; otherUUID: string } | { kind: "group"; grpId: string }

/** The first path segment after prefix/, or "" when the path isn't under it. */
function segmentAfter(pathname: string, prefix: string): string {
  return pathname.startsWith(prefix + "/") ? pathname.slice(prefix.length + 1).split("/")[0] : ""
}

/** The conversation a path shows: /app/chat/{otherUserId} is a DM, /app/chat/group/{grpId} a group chat. */
export function conversationAt(pathname: string): ChatTarget | null {
  if (pathname === app_grp_chat_path || pathname.startsWith(app_grp_chat_path + "/")) {
    const grpId = segmentAfter(pathname, app_grp_chat_path)
    return grpId ? { kind: "group", grpId } : null
  }
  const otherUUID = segmentAfter(pathname, app_chat_path)
  return otherUUID ? { kind: "dm", otherUUID } : null
}

/** The grouping id the server keeps a conversation's messages and unread count under. */
export function groupingIdOf(t: ChatTarget, selfUUID: string): string {
  return t.kind === "dm" ? getGroupingId(t.otherUUID, selfUUID) : t.grpId
}

/** Whether the conversation with this grouping id is the one at the path. */
export function isOpenAt(pathname: string, groupingId: string, selfUUID: string): boolean {
  const open = conversationAt(pathname)
  return !!open && groupingIdOf(open, selfUUID) === groupingId
}

/** A list of conversations as the server sent it, with the one at the path read. */
export function withOpenRead<T extends { dm_grouping_id: string; dm_unread: number }>(
  dms: T[],
  pathname: string,
  selfUUID: string | undefined,
): T[] {
  const open = selfUUID ? conversationAt(pathname) : null
  if (!open || !selfUUID) return dms
  const id = groupingIdOf(open, selfUUID)
  return dms.map((d) => (d.dm_grouping_id === id && d.dm_unread ? { ...d, dm_unread: 0 } : d))
}
