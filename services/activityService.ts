import axiosInstance from "@/lib/axiosInstance"
import { seenWrite } from "@/lib/activity/inboxBadge"
import { InboxPost } from "@/services/endpoints/inbox"

/**
 * The Inbox was looked at (reading the feed marks nothing: Home reads it).
 * Answers the badge after the write; null: written, not counted; false: failed.
 */
export async function markActivitySeen(): Promise<number | null | false> {
  const done = seenWrite()
  try {
    const res = await axiosInstance.post(InboxPost.MarkActivitySeen, undefined, {
      // @ts-expect-error — suppress the global loading bar for this
      // background, non-interactive request.
      silent: true,
      suppressErrorToast: true,
    })
    const count = res.data?.data?.count
    return typeof count === "number" ? count : null
  } catch {
    return false
  } finally {
    done()
  }
}

/** The most keys the server takes in one POST /activity/dismiss. */
export const DISMISS_KEYS_MAX = 20

/**
 * Takes Inbox items out of the session's own Priority (dismissed) or puts
 * them back, by the server's keys of them, DISMISS_KEYS_MAX to a write. The
 * server takes the person from the session: no user id is sent. Throws on a
 * failed write; the caller says so (no app-wide error toast).
 */
export async function setPriorityDismissed(keys: string[], dismissed: boolean): Promise<void> {
  for (let i = 0; i < keys.length; i += DISMISS_KEYS_MAX) {
    await axiosInstance.post(InboxPost.DismissFromPriority, { keys: keys.slice(i, i + DISMISS_KEYS_MAX), dismissed }, { suppressErrorToast: true })
  }
}
