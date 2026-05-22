import { createSlice } from "@reduxjs/toolkit";
import {UserProfileDataInterface} from "@/types/user";

interface addChannelTypingInterface {
    user: UserProfileDataInterface
    channelId: string
}

interface addChatTypingInterface {
    user: UserProfileDataInterface
    chatId: string
}

interface addGroupChatTypingInterface {
    user: UserProfileDataInterface
    grpId: string
}

interface removeChannelTypingInterface {
    userId: string
    channelId: string
}
interface removeChatTypingInterface {
    userId: string
    chatId: string
}
interface removeGroupChatTypingInterface {
    userId: string
    grpId: string
}

export interface userTypingInfoInterface {
    user: UserProfileDataInterface
    userId: string
    /**
     * Wall-clock timestamp (ms) of the most recent typing event for this
     * user. Consumers (selectors / components) compare this against
     * Date.now() to filter stale entries that the setTimeout-driven
     * cleanup may not have reached yet.
     *
     * Why this matters: setTimeout is suspended when a PWA / mobile tab
     * is backgrounded (especially on iOS Safari). The cleanup timer that
     * normally clears typing state after 4s never fires while the tab
     * sleeps, so the indicator stays "stuck" when the tab wakes up.
     * The wall-clock filter recovers the right state on the next render.
     */
    lastSeenAt: number
}
export interface ExtendedTypingState {
    [key: string]:  userTypingInfoInterface[];
}

const initialState = {
    chatTyping : {} as ExtendedTypingState,
    channelTyping: {} as ExtendedTypingState,
    groupChatTyping: {} as ExtendedTypingState,
}

export const typingSlice = createSlice({
    name: 'typing',
    initialState,
    reducers: {
        addChannelTyping: (state, action: {payload: addChannelTypingInterface}) => {
            const {user, channelId} = action.payload;
            if(!state.channelTyping[channelId]) {
                state.channelTyping[channelId] = [];
            }
            const now = Date.now();
            const existing = state.channelTyping[channelId].find(
                (t) => t.userId === user.user_uuid
            );
            if (existing) {
                // Same user already typing — refresh the wall-clock heartbeat.
                existing.lastSeenAt = now;
                existing.user = user;
            } else {
                state.channelTyping[channelId].push({ userId: user.user_uuid, user, lastSeenAt: now });
            }
        },

        addChatTyping: (state, action: {payload: addChatTypingInterface}) => {
            const {user, chatId} = action.payload;
            if(!state.chatTyping[chatId]) {
                state.chatTyping[chatId] = [];
            }
            const now = Date.now();
            const existing = state.chatTyping[chatId].find(
                (t) => t.userId === user.user_uuid
            );
            if (existing) {
                existing.lastSeenAt = now;
                existing.user = user;
            } else {
                state.chatTyping[chatId].push({ userId: user.user_uuid, user, lastSeenAt: now });
            }
        },

        addGroupChatTyping: (state, action: {payload: addGroupChatTypingInterface}) => {
            const {user, grpId} = action.payload;
            if(!state.groupChatTyping[grpId]) {
                state.groupChatTyping[grpId] = [];
            }
            const now = Date.now();
            const existing = state.groupChatTyping[grpId].find(
                (t) => t.userId === user.user_uuid
            );
            if (existing) {
                existing.lastSeenAt = now;
                existing.user = user;
            } else {
                state.groupChatTyping[grpId].push({ userId: user.user_uuid, user, lastSeenAt: now });
            }
        },

        RemoveChatTyping: (state, action: {payload: removeChatTypingInterface}) => {
            const {userId, chatId} = action.payload;
            if (state.chatTyping[chatId]) {
                state.chatTyping[chatId] = state.chatTyping[chatId].filter(
                    (userTyping) => userTyping.userId !== userId
                );
            }
        },

        RemoveChannelTyping: (state, action: {payload: removeChannelTypingInterface}) => {
            const {userId, channelId} = action.payload;
            if (state.channelTyping[channelId]) {
                state.channelTyping[channelId] = state.channelTyping[channelId].filter(
                    (userTyping) => userTyping.userId !== userId
                );
            }
        },

        RemoveGroupChatTyping: (state, action: {payload: removeGroupChatTypingInterface}) => {
            const {userId, grpId} = action.payload;
            if (state.groupChatTyping[grpId]) {
                state.groupChatTyping[grpId] = state.groupChatTyping[grpId].filter(
                    (userTyping) => userTyping.userId !== userId
                );
            }
        },

        /**
         * Sweep all stale typing entries across channels / chats / groups.
         * Called on tab wake-up and on a coarse interval so backgrounded
         * tabs converge to a clean state without depending on setTimeout
         * (which the OS suspends while the tab is hidden).
         */
        pruneStaleTyping: (state, action: { payload: { ttlMs: number } }) => {
            const cutoff = Date.now() - action.payload.ttlMs;
            const sweep = (bucket: ExtendedTypingState) => {
                for (const key of Object.keys(bucket)) {
                    const filtered = bucket[key].filter((t) => t.lastSeenAt >= cutoff);
                    if (filtered.length !== bucket[key].length) {
                        bucket[key] = filtered;
                    }
                }
            };
            sweep(state.chatTyping);
            sweep(state.channelTyping);
            sweep(state.groupChatTyping);
        },

    }
});

export const {
    addChannelTyping,
    addChatTyping,
    RemoveChatTyping,
    addGroupChatTyping,
    RemoveGroupChatTyping,
    RemoveChannelTyping,
    pruneStaleTyping,
} = typingSlice.actions

export default typingSlice;
