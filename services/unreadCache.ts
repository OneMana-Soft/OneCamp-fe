import { mutate } from "swr";

import { GetEndpointUrl } from "@/services/endPoints";
import type { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel";
import type { UserProfileInterface } from "@/types/user";

/**
 * The one place that knows which caches carry an unread count.
 *
 * THE BUG THIS EXISTS FOR. Reading something advances the server marker and
 * resets Redux, and the badge comes back anyway. The server is not wrong: it is
 * SWR in front of it.
 *
 * /user/sidebarNav is deduped for 30 seconds and hydrates every unread number
 * the app shows: channel badges, DM badges, and the activity count. Both
 * useHydrateUserSidebar and DesktopNavigationBar re-dispatch from it whenever
 * that data lands, and on a REMOUNT SWR hands back the CACHED payload
 * immediately. So navigating back to any page that mounts either one re-seeds
 * Redux from a payload recorded before the thing was read, and overwrites the
 * reset. Both read the same SWR key, so correcting it once fixes both.
 *
 * The per-surface list endpoints are worse: the channel list and the chat list
 * read no Redux at all, so a local reset never reached them in the first place.
 *
 * Every one of these has revalidateOnFocus off and a four-minute refresh, so a
 * stale count could stand for minutes on something just read.
 *
 * PATCHED, NOT REVALIDATED. The server is already correct by the time any of
 * these run, so refetching would spend requests to learn what we know. Writing
 * the corrected value in is instant and survives the remount that caused the
 * resurrection. The existing refresh cycle reconciles anything else.
 *
 * Callers must only invoke these once the server has actually been told.
 * Painting a badge read while the marker never moved hides a real unread count.
 */

/** Zero one entry in a list, matched on an id field, leaving the rest alone. */
function zeroOne<T extends Record<string, unknown>>(
    list: T[] | undefined,
    idField: keyof T,
    id: string,
    countField: keyof T,
): T[] {
    return (list || []).map((item) =>
        item[idField] === id ? { ...item, [countField]: 0 } : item,
    );
}

/** Apply a change to the sidenav payload, which every badge is hydrated from. */
function patchSidenav(update: (data: UserProfileInterface["data"]) => UserProfileInterface["data"]) {
    void mutate<UserProfileInterface>(
        GetEndpointUrl.SelfProfileSideNav,
        (cached) => (cached?.data ? { ...cached, data: update(cached.data) } : cached),
        { revalidate: false },
    );
}

/**
 * A channel has been read.
 *
 * Favourites are patched too: a favourite channel appears in user_fav_channels
 * as well, and the nav badge sums over both lists.
 */
export function clearChannelUnread(channelId: string): void {
    if (!channelId) return;

    patchSidenav((data) => ({
        ...data,
        user_channels: zeroOne(data.user_channels as unknown as Record<string, unknown>[], "ch_uuid", channelId, "unread_post_count") as unknown as ChannelInfoInterface[],
        user_fav_channels: zeroOne(data.user_fav_channels as unknown as Record<string, unknown>[], "ch_uuid", channelId, "unread_post_count") as unknown as ChannelInfoInterface[],
    }));

    // The channel-list key carries pagination, so every cached page is matched
    // rather than one known string.
    void mutate<ChannelInfoListInterfaceResp>(
        (key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GetUserActiveChannelList),
        (cached) =>
            cached
                ? {
                      ...cached,
                      channels_list: zeroOne(cached.channels_list as unknown as Record<string, unknown>[], "ch_uuid", channelId, "unread_post_count") as unknown as ChannelInfoInterface[],
                  }
                : cached,
        { revalidate: false },
    );
}

/**
 * A DM or group chat has been read. Keyed on the grouping id, which is what
 * both the sidebar and the chat list carry, and what the server counts against.
 */
export function clearChatUnread(groupingId: string): void {
    if (!groupingId) return;

    const zeroDms = (data: UserProfileInterface["data"]) => ({
        ...data,
        user_dms: zeroOne(
            data.user_dms as unknown as Record<string, unknown>[],
            "dm_grouping_id",
            groupingId,
            "dm_unread",
        ) as unknown as UserProfileInterface["data"]["user_dms"],
    });

    patchSidenav(zeroDms);

    // The chat list is a separate endpoint returning the same profile shape,
    // and like the channel list it reads no Redux, so nothing else clears it.
    void mutate<UserProfileInterface>(
        GetEndpointUrl.GetUserLatestChatList,
        (cached) => (cached?.data ? { ...cached, data: zeroDms(cached.data) } : cached),
        { revalidate: false },
    );
}

/**
 * The activity feed has been opened, which marks everything in it seen.
 *
 * A single number rather than a list, so there is nothing to match: opening the
 * feed is the whole reset.
 */
export function clearActivityUnread(): void {
    patchSidenav((data) => ({ ...data, user_total_unread_activity_count: 0 }));
}
