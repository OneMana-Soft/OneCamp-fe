import { mutate } from "swr";

import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import type { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel";
import type { UserProfileInterface } from "@/types/user";

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
        // Only after the server actually advanced the marker. Patching a cache
        // to say "read" when the request failed would hide a real unread count.
        clearUnreadInCaches(channelId);
    } catch {
        // Best-effort: leaving a channel must never fail loudly. The next
        // genuine channel open will re-advance the marker anyway.
    }
}

/** Zero a channel's unread count wherever it appears in a cached list. */
function zeroChannel(list: ChannelInfoInterface[] | undefined, channelId: string) {
    return (list || []).map((c) =>
        c.ch_uuid === channelId ? { ...c, unread_post_count: 0 } : c,
    );
}

/**
 * Correct the SWR caches that would otherwise resurrect the badge.
 *
 * THE BUG THIS FIXES. Reading a channel advanced the server marker and reset
 * Redux, and the badge still came back. Two caches feed those counts and
 * neither was told:
 *
 *   - /user/sidebarNav (dedupingInterval 30s) hydrates userSidebar.userChannels,
 *     which every nav badge and both dashboards read. useHydrateUserSidebar
 *     re-dispatches createUserChannelList whenever that data lands, and on a
 *     remount SWR hands back the CACHED payload immediately. So navigating back
 *     to any page that mounts the hook re-seeded Redux from a payload recorded
 *     before the channel was read, and overwrote the reset.
 *   - /ch/userActiveChannelsWithLatestPost (dedupingInterval 60s) backs the
 *     channel list view, which reads no Redux at all, so the reset never
 *     applied to it in the first place.
 *
 * Both have revalidateOnFocus off and a four-minute refresh, so the stale count
 * could stand for minutes on a channel the user had just finished reading.
 *
 * PATCHED, NOT REVALIDATED. The server is already correct by the time this
 * runs, so refetching would spend two requests per channel open to learn what we
 * already know. Writing the corrected value into the cache is instant, free, and
 * survives the remount that caused the resurrection. `revalidate: false` keeps
 * it that way; the existing refresh cycle reconciles anything else.
 */
function clearUnreadInCaches(channelId: string): void {
    // The sidenav key is exact. Patch both channel lists it carries: a favourite
    // channel appears in user_fav_channels and the badge sums over both.
    void mutate<UserProfileInterface>(
        GetEndpointUrl.SelfProfileSideNav,
        (cached) =>
            cached?.data
                ? {
                      ...cached,
                      data: {
                          ...cached.data,
                          user_channels: zeroChannel(cached.data.user_channels, channelId),
                          user_fav_channels: zeroChannel(cached.data.user_fav_channels, channelId),
                      },
                  }
                : cached,
        { revalidate: false },
    );

    // The channel-list key carries pagination, so every page currently cached
    // has to be matched rather than one known string.
    void mutate<ChannelInfoListInterfaceResp>(
        (key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GetUserActiveChannelList),
        (cached) =>
            cached
                ? { ...cached, channels_list: zeroChannel(cached.channels_list, channelId) }
                : cached,
        { revalidate: false },
    );
}
