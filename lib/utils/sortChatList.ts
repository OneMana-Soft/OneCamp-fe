import {UserDMInterface} from "@/types/user";

/**
 * Conversations by their latest message, newest first (D-S2): a new message
 * moves its conversation up, as Slack's DMs do, and being unread moves
 * nothing (the row turns bold where it is). Unread used to sort first, so a
 * row jumped when it was read. A conversation with no message yet goes last.
 * Pure.
 */
export const sortChatList = (usersDm: UserDMInterface[]) => {

    return usersDm.slice().sort((a, b) => {
        const aDate = a.dm_chats?.[0]?.chat_created_at;
        const bDate = b.dm_chats?.[0]?.chat_created_at;

        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;

        return bDate > aDate ? 1 : bDate < aDate ? -1 : 0;
    });
}
