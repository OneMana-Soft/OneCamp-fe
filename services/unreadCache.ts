import { appMutate, patchCached } from "@/lib/swrMutate";

import { GetEndpointUrl } from "@/services/endPoints";
import { INBOX_UNREAD } from "@/lib/activity/inboxBadge";
import type { ChannelInfoInterface, ChannelInfoListInterfaceResp } from "@/types/channel";
import type { UserProfileInterface } from "@/types/user";

/**
 * The one place that knows which caches carry an unread count (the Inbox
 * badge is not one: lib/activity/inboxBadge).
 *
 * Why: /user/sidebarNav (deduped for 30 seconds) and the channel and chat
 * lists carry unread numbers, refreshed every four minutes and not on focus,
 * and SWR hands a remount the CACHED payload, recorded before the thing was
 * read, so a badge reset in Redux came back.
 *
 * Patched, not revalidated: the server is right by the time these run. Only a
 * response already in hand is patched (lib/swrMutate patchCached): touching
 * one still on its way made SWR throw it away. Call these only once the
 * server has been told: a badge painted read while the marker never moved
 * hides a real unread count.
 */

/**
 * Set one entry's count in a list (0 unless said), matched on an id field,
 * leaving the rest alone. The same list back when that entry has that count
 * already, so a correction that changes nothing is no correction
 * (lib/swrMutate patchCached).
 */
function setOne<T extends Record<string, unknown>>(
    list: T[] | undefined,
    idField: keyof T,
    id: string,
    countField: keyof T,
    count = 0,
): T[] | undefined {
    if (!list?.some((item) => item[idField] === id && (item[countField] || 0) !== count)) return list;
    return list.map((item) => (item[idField] === id ? { ...item, [countField]: count } : item));
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
 * A channel has been read, or, with count, has that many unread (Mark unread,
 * or another tab's read: read.moved).
 *
 * Favourites are patched too: a favourite channel appears in user_fav_channels
 * as well, and the nav badge sums over both lists.
 */
export function clearChannelUnread(channelId: string, count = 0): void {
    if (!channelId) return;

    const zeroChannel = (list: ChannelInfoInterface[] | undefined) =>
        setOne(list as unknown as Rows, "ch_uuid", channelId, "unread_post_count", count) as unknown as ChannelInfoInterface[];

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
 * A DM or group chat has been read, or, with count, has that many unread.
 * Keyed on the grouping id, which is what both the sidebar and the chat list
 * carry, and what the server counts against.
 */
export function clearChatUnread(groupingId: string, count = 0): void {
    if (!groupingId) return;

    const zeroDms = (data: Sidenav) =>
        withField(data, "user_dms", setOne(data.user_dms as unknown as Rows, "dm_grouping_id", groupingId, "dm_unread", count) as unknown as Sidenav["user_dms"]);

    patchSidenav(zeroDms);

    // The chat list is a separate endpoint returning the same profile shape,
    // and like the channel list it reads no Redux, so nothing else clears it.
    patchCached<UserProfileInterface>(GetEndpointUrl.GetUserLatestChatList, (cached) =>
        cached.data ? withField(cached, "data", zeroDms(cached.data)) : cached,
    );
}

/** The Inbox badge reads the server's count again (lib/activity/inboxBadge). */
export function recountInbox(): void {
    void appMutate(INBOX_UNREAD);
}
