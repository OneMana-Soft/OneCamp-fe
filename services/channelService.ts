import axiosInstance from "@/lib/axiosInstance";
import { PostEndpointUrl } from "@/services/endPoints";

/**
 * markChannelSeen advances the user's server-side last-seen marker for a
 * channel so the unread badge (computed server-side as the count of posts
 * created after the marker) collapses to zero.
 *
 * Why this exists: opening a channel advances last-seen once, but messages
 * that arrive WHILE the user is actively viewing (bot/agent replies, other
 * members) are not reflected in the marker. Without this call, the next
 * channel-list refetch would recompute a non-zero unread count and the mobile
 * bottom-nav badge would "resurrect" for a channel the user has actually read.
 *
 * It is intentionally fire-and-forget and silent: it runs on channel leave
 * (page unmount / channel switch), so a failure must never surface an error
 * toast or block navigation. The local Redux reset already gives the user the
 * correct immediate UX; this call makes that reset durable across refetches.
 */
export async function markChannelSeen(channelId: string): Promise<void> {
    if (!channelId) return;
    try {
        await axiosInstance.post(
            `${PostEndpointUrl.MarkChannelSeen}/${channelId}`,
            undefined,
            {
                // @ts-expect-error — suppress the global loading bar for this
                // background, non-interactive request.
                silent: true,
            },
        );
    } catch {
        // Best-effort: leaving a channel must never fail loudly. The next
        // genuine channel open will re-advance the marker anyway.
    }
}
