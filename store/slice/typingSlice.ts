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
            const userExistInList = state.channelTyping[channelId].some(
                (typingUserInfo) => typingUserInfo.userId === user.user_uuid
            );
            if(!userExistInList) {
                state.channelTyping[channelId].push({userId: user.user_uuid, user});
            }
        },

        addChatTyping: (state, action: {payload: addChatTypingInterface}) => {
            const {user, chatId} = action.payload;
            if(!state.chatTyping[chatId]) {
                state.chatTyping[chatId] = [];
            }
            const userExistInList = state.chatTyping[chatId].some(
                (typingUserInfo) => typingUserInfo.userId === user.user_uuid
            );
            if(!userExistInList) {
                state.chatTyping[chatId].push({userId: user.user_uuid, user});
            }
        },

        addGroupChatTyping: (state, action: {payload: addGroupChatTypingInterface}) => {
            const {user, grpId} = action.payload;
            if(!state.groupChatTyping[grpId]) {
                state.groupChatTyping[grpId] = [];
            }
            const userExistInList = state.groupChatTyping[grpId].some(
                (typingUserInfo) => typingUserInfo.userId === user.user_uuid
            );
            if(!userExistInList) {
                state.groupChatTyping[grpId].push({userId: user.user_uuid, user});
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

    }
});

export const {
    addChannelTyping,
    addChatTyping,
    RemoveChatTyping,
    addGroupChatTyping,
    RemoveGroupChatTyping,
    RemoveChannelTyping } = typingSlice.actions

export default typingSlice;
