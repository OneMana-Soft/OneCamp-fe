import { configureStore} from "@reduxjs/toolkit";
import storage from "@/lib/utils/storage";
import { persistReducer, persistStore } from "redux-persist";
import refreshSlice from "@/store/slice/refreshSlice";
import reactionSlice from "@/store/slice/reactionSlice";
import {taskInfoSlice} from "@/store/slice/taskInfoSlice";
import {projectAttachmentSlice} from "@/store/slice/projectAttachmentSlice";
import channelSlice from "@/store/slice/channelSlice";
import chatSlice from "@/store/slice/chatSlice";
import fwdMessageSlice from "@/store/slice/fwdMessageSlice";
import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice";
import channelCommentSlice from "@/store/slice/channelCommentSlice";
import {chatCommentSlice} from "@/store/slice/chatCommentSlice";
import userSlice from "@/store/slice/userSlice";
import typingSlice from "@/store/slice/typingSlice";
import {createTaskDialogSlice} from "@/store/slice/createTaskDailogSlice";
import {createTaskCommentSlice} from "@/store/slice/createTaskCommentSlice";
import taskFilterSlice from "@/store/slice/taskFilterSlice";
import currentTaskSlice from "@/store/slice/currentTaskSlice";
import groupChatSlice from "@/store/slice/groupChatSlice";
import {createDocCommentSlice} from "@/store/slice/createDocCommentSlice";
import uiSlice from "@/store/slice/uiSlice";
import mentionSlice from "./slice/mentionSlice";
import { recentItemsSlice } from "./slice/recentItemsSlice";


const rootPersistConfig = {
    key: 'root',
    storage: storage,
    whitelist: [
        recentItemsSlice.name,
    ]
}

// Manually compose root reducer to avoid combineReducers type complexity
const rootReducer = (
    state: RootState | undefined,
    action: any
): RootState => {
    if (!state) {
        return {
            [userSlice.name]: userSlice.reducer(undefined, action),
            [refreshSlice.name]: refreshSlice.reducer(undefined, action),
            [channelSlice.name]: channelSlice.reducer(undefined, action),
            [uiSlice.name]: uiSlice.reducer(undefined, action),
            [projectAttachmentSlice.name]: projectAttachmentSlice.reducer(undefined, action),
            [createTaskDialogSlice.name]: createTaskDialogSlice.reducer(undefined, action),
            [createTaskCommentSlice.name]: createTaskCommentSlice.reducer(undefined, action),
            [taskInfoSlice.name]: taskInfoSlice.reducer(undefined, action),
            [reactionSlice.name]: reactionSlice.reducer(undefined, action),
            [chatSlice.name]: chatSlice.reducer(undefined, action),
            [groupChatSlice.name]: groupChatSlice.reducer(undefined, action),
            [fwdMessageSlice.name]: fwdMessageSlice.reducer(undefined, action),
            [desktopRightPanelSlice.name]: desktopRightPanelSlice.reducer(undefined, action),
            [typingSlice.name]: typingSlice.reducer(undefined, action),
            [taskFilterSlice.name]: taskFilterSlice.reducer(undefined, action),
            [currentTaskSlice.name]: currentTaskSlice.reducer(undefined, action),
            [createDocCommentSlice.name]: createDocCommentSlice.reducer(undefined, action),
            [channelCommentSlice.name]: channelCommentSlice.reducer(undefined, action),
            [chatCommentSlice.name]: chatCommentSlice.reducer(undefined, action),
            [mentionSlice.name]: mentionSlice.reducer(undefined, action),
            [recentItemsSlice.name]: recentItemsSlice.reducer(undefined, action),
        } as RootState
    }

    return {
        [userSlice.name]: userSlice.reducer(state[userSlice.name], action),
        [refreshSlice.name]: refreshSlice.reducer(state[refreshSlice.name], action),
        [channelSlice.name]: channelSlice.reducer(state[channelSlice.name], action),
        [uiSlice.name]: uiSlice.reducer(state[uiSlice.name], action),
        [projectAttachmentSlice.name]: projectAttachmentSlice.reducer(state[projectAttachmentSlice.name], action),
        [createTaskDialogSlice.name]: createTaskDialogSlice.reducer(state[createTaskDialogSlice.name], action),
        [createTaskCommentSlice.name]: createTaskCommentSlice.reducer(state[createTaskCommentSlice.name], action),
        [taskInfoSlice.name]: taskInfoSlice.reducer(state[taskInfoSlice.name], action),
        [reactionSlice.name]: reactionSlice.reducer(state[reactionSlice.name], action),
        [chatSlice.name]: chatSlice.reducer(state[chatSlice.name], action),
        [groupChatSlice.name]: groupChatSlice.reducer(state[groupChatSlice.name], action),
        [fwdMessageSlice.name]: fwdMessageSlice.reducer(state[fwdMessageSlice.name], action),
        [desktopRightPanelSlice.name]: desktopRightPanelSlice.reducer(state[desktopRightPanelSlice.name], action),
        [typingSlice.name]: typingSlice.reducer(state[typingSlice.name], action),
        [taskFilterSlice.name]: taskFilterSlice.reducer(state[taskFilterSlice.name], action),
        [currentTaskSlice.name]: currentTaskSlice.reducer(state[currentTaskSlice.name], action),
        [createDocCommentSlice.name]: createDocCommentSlice.reducer(state[createDocCommentSlice.name], action),
        [channelCommentSlice.name]: channelCommentSlice.reducer(state[channelCommentSlice.name], action),
        [chatCommentSlice.name]: chatCommentSlice.reducer(state[chatCommentSlice.name], action),
        [mentionSlice.name]: mentionSlice.reducer(state[mentionSlice.name], action),
        [recentItemsSlice.name]: recentItemsSlice.reducer(state[recentItemsSlice.name], action),
    } as RootState
}

export type RootState = {
    [userSlice.name]: ReturnType<typeof userSlice.reducer>
    [refreshSlice.name]: ReturnType<typeof refreshSlice.reducer>
    [channelSlice.name]: ReturnType<typeof channelSlice.reducer>
    [uiSlice.name]: ReturnType<typeof uiSlice.reducer>
    [projectAttachmentSlice.name]: ReturnType<typeof projectAttachmentSlice.reducer>
    [createTaskDialogSlice.name]: ReturnType<typeof createTaskDialogSlice.reducer>
    [createTaskCommentSlice.name]: ReturnType<typeof createTaskCommentSlice.reducer>
    [taskInfoSlice.name]: ReturnType<typeof taskInfoSlice.reducer>
    [reactionSlice.name]: ReturnType<typeof reactionSlice.reducer>
    [chatSlice.name]: ReturnType<typeof chatSlice.reducer>
    [groupChatSlice.name]: ReturnType<typeof groupChatSlice.reducer>
    [fwdMessageSlice.name]: ReturnType<typeof fwdMessageSlice.reducer>
    [desktopRightPanelSlice.name]: ReturnType<typeof desktopRightPanelSlice.reducer>
    [typingSlice.name]: ReturnType<typeof typingSlice.reducer>
    [taskFilterSlice.name]: ReturnType<typeof taskFilterSlice.reducer>
    [currentTaskSlice.name]: ReturnType<typeof currentTaskSlice.reducer>
    [createDocCommentSlice.name]: ReturnType<typeof createDocCommentSlice.reducer>
    [channelCommentSlice.name]: ReturnType<typeof channelCommentSlice.reducer>
    [chatCommentSlice.name]: ReturnType<typeof chatCommentSlice.reducer>
    [mentionSlice.name]: ReturnType<typeof mentionSlice.reducer>
    [recentItemsSlice.name]: ReturnType<typeof recentItemsSlice.reducer>
}

const persistedReducer = persistReducer(rootPersistConfig, rootReducer);

const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false
        })
})

export const persistor = persistStore(store);

export default store;
