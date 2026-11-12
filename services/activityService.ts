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
