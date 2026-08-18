/**
 * notificationRoute — the single mapping from a push payload to the in-app URL
 * it should open.
 *
 * This existed twice before, once in components/fcm/FCMHandler.tsx for
 * foreground toasts and once in public/firebase-messaging-sw.js for background
 * notification taps, and the two had drifted from each other AND from what the
 * backend actually sends. Tapping a task notification opened /app/tasks/undefined:
 * the route is /app/task/[task-id] (singular), and for type "task" the backend
 * puts the task id in type_id and never sets thread_id at all. Both copies read
 * thread_id and both spelled the segment "tasks".
 *
 * The payload keys are defined in initializers/firebaseInit/connectFirebase.go
 * and populated per notification kind. That contract is NOT uniform, so it is
 * written out here rather than guessed at — this table is the reason the function
 * looks the way it does:
 *
 *   type                   type_id                     thread_id      source
 *   chat                   chat grouping id            chat uuid*     business/Chat/chatBusiness.go
 *   chat_reaction          chat grouping id            chat uuid      business/Chat/chatBusiness.go
 *   chat_comment_reaction  chat grouping id            chat uuid      business/Chat/chatBusiness.go
 *   chat_comment           chat grouping id            chat uuid      business/Comment/commentBusiness.go
 *   channel                channel id                  post id        business/Post/postBusiness.go
 *   post_comment           channel id                  post id        business/Comment/commentBusiness.go
 *   channel_call           channel id                  —              business/Channel/channelBusiness.go
 *   task                   TASK id                     —              business/Task/taskBusiness.go
 *   task_comment           project id                  TASK id        business/Comment/commentBusiness.go
 *   doc_comment            doc id                      —              business/Comment/commentBusiness.go
 *   reminder               recipient user id           —              business/Command/delivery.go
 *
 *   (*) some chat senders omit thread_id; the chat arm doesn't need it.
 *
 * Note the two shapes that catch people out: the task id lives in type_id for
 * "task" but in thread_id for "task_comment", and a chat grouping id is either
 * two space-separated user uuids (a DM) or a group id.
 */

/** The subset of FCM `data` this needs. Everything is optional: it's wire data. */
export interface PushNotificationData {
  type?: string
  type_id?: string
  thread_id?: string
}

/** Where anything unrecognised, or missing the id it needs, lands. */
export const NOTIFICATION_FALLBACK_ROUTE = "/app"

/** Chat-family types: all keyed by a chat grouping id in type_id. */
const CHAT_THREAD_TYPES = new Set([
  "chat_reaction",
  "chat_comment",
  "chat_comment_reaction",
])

/**
 * Resolves a chat grouping id to its route segment.
 *
 * A DM's grouping id is the two participants' uuids joined by a space, so the
 * conversation is named after the OTHER person — which is why this needs to know
 * who is logged in. Anything without a space is a group chat.
 *
 * Without a known self uuid a DM can't be resolved (picking the wrong half would
 * open a conversation with yourself), so it returns null and the caller falls
 * back rather than navigating somewhere wrong.
 */
export function chatRouteSegment(groupingId: string, selfUUID?: string): string | null {
  const id = groupingId.trim()
  if (!id) return null
  if (!id.includes(" ")) return `group/${id}`
  const participants = id.split(" ").filter(Boolean)
  if (participants.length < 2) return participants[0] ? `group/${participants[0]}` : null
  if (!selfUUID) return null
  const other = participants.find((p) => p !== selfUUID)
  // A DM with yourself is legitimate (self-notes), so fall back to the first id
  // rather than refusing to navigate.
  return other || participants[0]
}

/**
 * Maps a push payload to the URL to open. Never returns a path containing an
 * undefined/empty segment: when a required id is absent the fallback wins, so a
 * notification tap always lands somewhere real.
 */
export function notificationRoute(
  data: PushNotificationData | null | undefined,
  selfUUID?: string,
): string {
  if (!data?.type) return NOTIFICATION_FALLBACK_ROUTE
  const typeId = data.type_id?.trim() || ""
  const threadId = data.thread_id?.trim() || ""

  if (data.type === "chat" || CHAT_THREAD_TYPES.has(data.type)) {
    const segment = typeId ? chatRouteSegment(typeId, selfUUID) : null
    if (!segment) return NOTIFICATION_FALLBACK_ROUTE
    // A plain new message opens the conversation; a reaction or a reply opens the
    // thread it happened in, when we were told which one.
    if (data.type !== "chat" && threadId) return `/app/chat/${segment}/${threadId}`
    return `/app/chat/${segment}`
  }

  switch (data.type) {
    case "channel":
    case "post_comment":
      if (!typeId) return NOTIFICATION_FALLBACK_ROUTE
      return threadId ? `/app/channel/${typeId}/${threadId}` : `/app/channel/${typeId}`

    case "channel_call":
      return typeId ? `/app/channel/${typeId}` : NOTIFICATION_FALLBACK_ROUTE

    // The task id is in type_id here…
    case "task":
      return typeId ? `/app/task/${typeId}` : NOTIFICATION_FALLBACK_ROUTE

    // …and in thread_id here, because type_id carries the project.
    case "task_comment":
      return threadId ? `/app/task/${threadId}` : NOTIFICATION_FALLBACK_ROUTE

    case "doc_comment":
      return typeId ? `/app/doc/${typeId}` : NOTIFICATION_FALLBACK_ROUTE

    // A fired /remind carries no target: focus the app and let the in-app
    // surface show the reminder itself.
    case "reminder":
      return NOTIFICATION_FALLBACK_ROUTE

    default:
      return NOTIFICATION_FALLBACK_ROUTE
  }
}
