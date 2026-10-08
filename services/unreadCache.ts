import { patchCached } from "@/lib/swrMutate";

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
 * resurrection. The existing refresh cycle reconciles anything else. Only a
 * response already in hand is patched (lib/swrMutate patchCached): touching
 * one still on its way made SWR throw it away.
 *
 * Callers must only invoke these once the server has actually been told.
 * Painting a badge read while the marker never moved hides a real unread count.
 */

/**
 * Zero one entry in a list, matched on an id field, leaving the rest alone.
 * The same list back when that entry has nothing to clear, so a correction
 * that changes nothing is no correction (lib/swrMutate patchCached).
 */
function zeroOne<T extends Record<string, unknown>>(
    list: T[] | undefined,
    idField: keyof T,
    id: string,
    countField: keyof T,
): T[] | undefined {
    if (!list?.some((item) => item[idField] === id && item[countField])) return list;
    return list.map((item) => (item[idField] === id ? { ...item, [countField]: 0 } : item));
}

/** obj with field set to value, or obj itself when it has that value already. */
function withField<T extends object, K extends keyof T>(obj: T, field: K, value: T[K]): T {
    return obj[field] === value ? obj : { ...obj, [field]: value };
}

type Sidenav = UserProfileInterface["data"];
type Rows = Record<string, unknown>[];

/** Apply a change to the sidenav payload, which every badge is hydrated from. */
function patchSidenav(update: (data: Sidenav) => Sidenav) {
    patchCached<UserProfileInterface>(GetEndpointUrl.SelfProfileSideNav, (cached) =>
        cached.data ? withField(cached, "data", update(cached.data)) : cached,
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

    const zeroChannel = (list: ChannelInfoInterface[] | undefined) =>
        zeroOne(list as unknown as Rows, "ch_uuid", channelId, "unread_post_count") as unknown as ChannelInfoInterface[];

    patchSidenav((data) =>
        withField(withField(data, "user_channels", zeroChannel(data.user_channels)), "user_fav_channels", zeroChannel(data.user_fav_channels)),
    );

    // The channel-list key carries pagination, so every cached page is matched
    // rather than one known string.
    patchCached<ChannelInfoListInterfaceResp>(
        (key) => key.startsWith(GetEndpointUrl.GetUserActiveChannelList),
        (cached) => withField(cached, "channels_list", zeroChannel(cached.channels_list)),
    );
}

/**
 * A DM or group chat has been read. Keyed on the grouping id, which is what
 * both the sidebar and the chat list carry, and what the server counts against.
 */
export function clearChatUnread(groupingId: string): void {
    if (!groupingId) return;

    const zeroDms = (data: Sidenav) =>
        withField(data, "user_dms", zeroOne(data.user_dms as unknown as Rows, "dm_grouping_id", groupingId, "dm_unread") as unknown as Sidenav["user_dms"]);

    patchSidenav(zeroDms);

    // The chat list is a separate endpoint returning the same profile shape,
    // and like the channel list it reads no Redux, so nothing else clears it.
    patchCached<UserProfileInterface>(GetEndpointUrl.GetUserLatestChatList, (cached) =>
        cached.data ? withField(cached, "data", zeroDms(cached.data)) : cached,
    );
}

/**
 * The activity feed has been opened, which marks everything in it seen.
 *
 * A single number rather than a list, so there is nothing to match: opening the
 * feed is the whole reset.
 */
export function clearActivityUnread(): void {
    patchSidenav((data) => withField(data, "user_total_unread_activity_count", 0));
}
