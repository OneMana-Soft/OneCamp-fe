import { chatRef, route } from "@/lib/conversation/route"

// The web app's one rule for links to a conversation (chat programme,
// PROGRAM.md CH13) is the Link Router, lib/conversation/route.ts (chat A1).
// chatPath is its form for a DM's or group's grouping id, which is how most
// sources name one (search hits, Activity, the server's events).

/**
 * Where a conversation opens, for the person signed in: a group at
 * /app/chat/group/<grouping id>, a DM at /app/chat/<the other person> (a DM's
 * grouping id is both people's ids with a space between them, and the chat
 * route takes the other person's id), and with a message id, that message
 * with its thread. Null when it can't be built: no grouping id, or a DM while
 * who is signed in isn't known yet, where guessing could open a conversation
 * with the wrong person. The server's copy is helpers.ChatPath. Pure.
 */
export function chatPath(
  groupingId: string | null | undefined,
  selfUUID: string | null | undefined,
  messageId?: string | null,
): string | null {
  const conversation = chatRef(groupingId, selfUUID)
  if (!conversation) return null
  return route({ conversation, ...(messageId ? { message: messageId } : {}) })
}
