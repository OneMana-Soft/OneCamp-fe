import { createSlice } from "@reduxjs/toolkit";


interface UpdateRefreshTokenStatusInterface {
    exist: boolean
}

const initialState = {
    exist: true
}

const refreshSlice = createSlice({
    name: 'refresh',
    initialState,
    reducers: {
        updateRefreshTokenStatus: (state, action:{payload: UpdateRefreshTokenStatusInterface}) => {
            state.exist = action.payload.exist
        }
    }

});

export const { updateRefreshTokenStatus } = refreshSlice.actions

export default refreshSlice;
