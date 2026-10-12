import axiosInstance from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * markActivitySeen tells the server the Inbox has been looked at, so its
 * badge counts from now. Reading the feed marks nothing: Home reads it on
 * every load, and when that marked it seen, opening the app cleared the
 * badge with replies and reactions still unseen. The Inbox asks instead.
 *
 * Silent and best-effort, as markChannelSeen: the Inbox clears its badge on
 * screen at once, and this makes the clearing last past the next sidebar
 * read. A failure leaves the server's count, which is then still right.
 */
export async function markActivitySeen(): Promise<void> {
  try {
    await axiosInstance.post(PostEndpointUrl.MarkActivitySeen, undefined, {
      // @ts-expect-error — suppress the global loading bar for this
      // background, non-interactive request.
      silent: true,
    })
  } catch {
    // The next time the Inbox opens, it asks again.
  }
}
