import { configureStore} from "@reduxjs/toolkit";
import storage from "@/lib/utils/storage";
import { onSessionEnd } from "@/lib/sessionEnd";
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
import groupChatSlice from "@/store/slice/groupChatSlice";
import {createDocCommentSlice} from "@/store/slice/createDocCommentSlice";
import uiSlice from "@/store/slice/uiSlice";
import mentionSlice from "./slice/mentionSlice";
import { recentItemsSlice } from "./slice/recentItemsSlice";
import messageResyncSlice from "@/store/slice/messageResyncSlice";
import { commandSlice } from "@/store/slice/commandSlice";
import nudgeSlice from "@/store/slice/nudgeSlice";
import pendingActionSlice from "@/store/slice/pendingActionSlice";
import splitSlice from "@/store/slice/splitSlice";


const rootPersistConfig = {
    key: 'root',
    storage: storage,
    whitelist: [
        recentItemsSlice.name,
    ]
}

// RESET_STORE_ACTION is dispatched on logout to wipe ALL Redux state back to
// each slice's initial state. Without this, the redux-persist singleton keeps
// the previous user's persisted slice(s) (e.g. recentItems) in memory and can
// re-flush them after a naive localStorage.clear(), leaking one user's Recent
// items / state into the next user's session. Pairs with persistor.purge(),
// both run by the session-end hook at the bottom of this file.
export const RESET_STORE_ACTION = "store/RESET"

// Every slice, under the name its state lives at.
const SLICES = [
    userSlice, refreshSlice, channelSlice, uiSlice, projectAttachmentSlice,
    createTaskDialogSlice, createTaskCommentSlice, taskInfoSlice, reactionSlice,
    chatSlice, groupChatSlice, fwdMessageSlice, desktopRightPanelSlice, typingSlice,
    taskFilterSlice, createDocCommentSlice, channelCommentSlice, chatCommentSlice,
    mentionSlice, recentItemsSlice, messageResyncSlice, commandSlice, nudgeSlice,
    pendingActionSlice, splitSlice,
] as const

type AnyReducer = (state: unknown, action: unknown) => unknown

// Composed by hand to avoid combineReducers' type complexity, and like
// combineReducers it returns the same state object when no slice changed.
// It used to build a new one for every action, so every useSelector in the app
// ran again on every dispatch, a typing sweep every 2 seconds among them, and
// any selector returning a fresh value re-rendered its component each time.
// store/rootReducer.test.ts holds it.
const rootReducer = (
    state: RootState | undefined,
    action: any
): RootState => {
    // On logout, drop all slice state so every reducer rebuilds from its
    // initial state. This guarantees no cross-user leakage regardless of which
    // slices are persisted.
    if (action?.type === RESET_STORE_ACTION) {
        state = undefined
    }
    let changed = state === undefined
    const next: Record<string, unknown> = {}
    for (const slice of SLICES) {
        const before = (state as Record<string, unknown> | undefined)?.[slice.name]
        const after = (slice.reducer as AnyReducer)(before, action)
        next[slice.name] = after
        if (after !== before) changed = true
    }
    return changed ? (next as RootState) : (state as RootState)
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
    [createDocCommentSlice.name]: ReturnType<typeof createDocCommentSlice.reducer>
    [channelCommentSlice.name]: ReturnType<typeof channelCommentSlice.reducer>
    [chatCommentSlice.name]: ReturnType<typeof chatCommentSlice.reducer>
    [mentionSlice.name]: ReturnType<typeof mentionSlice.reducer>
    [recentItemsSlice.name]: ReturnType<typeof recentItemsSlice.reducer>
    [messageResyncSlice.name]: ReturnType<typeof messageResyncSlice.reducer>
    [commandSlice.name]: ReturnType<typeof commandSlice.reducer>
    [nudgeSlice.name]: ReturnType<typeof nudgeSlice.reducer>
    [pendingActionSlice.name]: ReturnType<typeof pendingActionSlice.reducer>
    [splitSlice.name]: ReturnType<typeof splitSlice.reducer>
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

// When a session ends: 1. reset every slice in memory, 2. purge the persisted
// blob and flush, so the persistor stops writing the old state back. Storage
// is cleared only after this, by the caller of endSession.
onSessionEnd(async () => {
    store.dispatch({ type: RESET_STORE_ACTION });
    await persistor.purge();
    await persistor.flush();
});

export default store;
