// Stub: nudgeSlice — AI nudge system not available in this build.
import { createSlice, PayloadAction } from "@reduxjs/toolkit"

type Nudge = { id: string; [key: string]: unknown }

const nudgeSlice = createSlice({
    name: "nudge",
    initialState: { nudges: [] as Nudge[], openCount: 0 },
    reducers: {
        upsertNudge: (state, _action: PayloadAction<Nudge>) => { void state },
        setOpenCount: (state, _action: PayloadAction<number>) => { void state },
    },
})

export const { upsertNudge, setOpenCount } = nudgeSlice.actions
export default nudgeSlice
