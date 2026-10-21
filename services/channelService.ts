import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance";
import { appMutate } from "@/lib/swrMutate";
import { GetEndpointUrl } from "@/services/endPoints";
import { ChatPost } from "@/services/endpoints/chat";
import { clearChannelUnread } from "@/services/unreadCache";

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
            `${ChatPost.MarkChannelSeen}/${channelId}`,
            undefined,
            {
                // @ts-expect-error — suppress the global loading bar for this
                // background, non-interactive request.
                silent: true,
            },
        );
        // Only after the server actually advanced the marker. Patching a cache
        // to say "read" when the request failed would hide a real unread count.
        clearChannelUnread(channelId);
    } catch {
        // Best-effort: leaving a channel must never fail loudly. The next
        // genuine channel open will re-advance the marker anyway.
    }
}

/**
 * restoreChannel brings an archived channel back, with its history: its
 * admins and the workspace's admins may (the server answers 403 to anyone
 * else). Throws on failure, so the caller can say so.
 *
 * Then it asks for the sidebar again, which is read once and kept: the
 * channel is back in it for a restorer who is a member, and stays out of it
 * for a workspace admin from outside the channel.
 */
export async function restoreChannel(channelId: string): Promise<void> {
    // Each place that restores says what failed, in its own words.
    await axiosInstance.post(ChatPost.RestoreChannel, { channel_uuid: channelId }, OWN_ERRORS);
    void appMutate(GetEndpointUrl.SelfProfileSideNav);
}
