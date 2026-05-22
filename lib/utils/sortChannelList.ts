import {Channel} from "node:diagnostics_channel";
import {ChannelInfoInterface} from "@/types/channel";

export const sortChannelList = (channels: ChannelInfoInterface[], favUUIDs?: Set<string>) => {

    if(!channels.length) {return []}
    return [...channels].sort((a, b) => {
        // 1. Favorites first (if favUUIDs Set is provided)
        if (favUUIDs) {
            const aFav = favUUIDs.has(a.ch_uuid) ? 1 : 0;
            const bFav = favUUIDs.has(b.ch_uuid) ? 1 : 0;
            if (aFav !== bFav) return bFav - aFav;
        }

        // 2. Compare unread post counts (descending)
        const unreadDiff = (b.unread_post_count || 0) - (a.unread_post_count || 0);
        if (unreadDiff !== 0) return unreadDiff;

        // 3. Check if either channel has a valid post date
        const aDate = a.ch_posts?.[0]?.post_created_at;
        const bDate = b.ch_posts?.[0]?.post_created_at;

        // If only one has a date, prioritize it
        if (aDate && !bDate) return -1;
        if (bDate && !aDate) return 1;

        // If both have dates, compare them (descending)
        if (aDate && bDate) return bDate > aDate ? 1 : -1;

        return 0;
    });
}