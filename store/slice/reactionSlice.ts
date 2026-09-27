import {createSlice, PayloadAction} from "@reduxjs/toolkit";


const initialState: FrequentReactionsState = {
    lastUsedReactionId: null,
    frequentReactionIdsMap: null
};

interface FrequentReactionsState {
    lastUsedReactionId: string | null
    frequentReactionIdsMap: Record<string, number> | null
}

const reactionSlice = createSlice({
    name: "reaction",
    initialState,
    reducers: {

        setLastUsedReactionId(state, action: PayloadAction<string>) {
            state.lastUsedReactionId = action.payload
        },
        setFrequentReactionIdsMap(state, action: PayloadAction<Record<string, number> | null>) {
            state.frequentReactionIdsMap = action.payload
        }

    },
});

export const {
    setLastUsedReactionId,
    setFrequentReactionIdsMap
} = reactionSlice.actions;

export default reactionSlice;
