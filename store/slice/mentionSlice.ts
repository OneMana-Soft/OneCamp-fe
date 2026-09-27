import { createSlice } from "@reduxjs/toolkit";

const initialState = {
    openedRecently : false
}

interface openedRecentlyStateInterface {
    openedRecently: boolean
}

const mentionSlice = createSlice({
    name: 'mention',
    initialState,
    reducers: {
        updateMentionOpenedRecently: (state, action:{payload: openedRecentlyStateInterface}) => {
            state.openedRecently = action.payload.openedRecently
        },

    }

});

export const { updateMentionOpenedRecently } = mentionSlice.actions

export default mentionSlice;