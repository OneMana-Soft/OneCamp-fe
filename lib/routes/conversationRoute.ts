import { chatRouteSegment } from "@/lib/utils/notificationRoute"

// The web app's one rule for links to a conversation (chat programme,
// PROGRAM.md CH13): W0-F's helper, moved here at the programme's day 0. A1
// adds route() and parse() for every ConversationRef beside it, and every
// link builder calls them.

/**
 * Where a conversation opens, for the person signed in: a group at
 * /app/chat/group/<grouping id>, a DM at /app/chat/<the other person> (a DM's
 * grouping id is both people's ids with a space between them, and the chat
 * route takes the other person's id), and with a message id, that message
 * with its thread. Null when it can't be built: no grouping id, or a DM while
 * who is signed in isn't known yet, where guessing could open a conversation
 * with the wrong person.
 *
 * The one rule for every link to a conversation: search, the palette,
 * Activity. The grouping id itself in the path opened a conversation "with" a
 * message id. Built on chatRouteSegment, the rule push taps use; the server's
 * copy is helpers.ChatPath. Pure.
 */
export function chatPath(
  groupingId: string | null | undefined,
  selfUUID: string | null | undefined,
  messageId?: string | null,
): string | null {
  const segment = groupingId ? chatRouteSegment(groupingId, selfUUID || undefined) : null
  if (!segment) return null
  return messageId ? `/app/chat/${segment}/${messageId}` : `/app/chat/${segment}`
}
