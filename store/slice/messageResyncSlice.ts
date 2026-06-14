// Stub: messageResyncSlice — AI resync system not available in this build.
import { createSlice } from "@reduxjs/toolkit"

const messageResyncSlice = createSlice({
    name: "messageResync",
    initialState: { nonce: 0 },
    reducers: {
        triggerMessageResync: (state) => { state.nonce += 1 },
    },
})

export const { triggerMessageResync } = messageResyncSlice.actions
export default messageResyncSlice
